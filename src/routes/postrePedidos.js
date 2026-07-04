require("dotenv").config();
const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const Postre = require("../models/postre");
const PostrePedido = require("../models/postrePedido");
const checkRoleToken = require("../middlewares/myRoleToken");
const { generarNumeroOrden } = require("../utils/orderNumber");
const { resolverZona, ZONAS } = require("../utils/zonasEnvio");
const { validarFechaHora, getSlotsValidos } = require("../utils/galletaSlots");
const { mountNotaInternaRoutes } = require("../utils/notaInternaRoute");

const FRONT_DOMAIN = process.env.FRONT_DOMAIN;

// Notas internas — mismo patrón que galletas/cotizaciones.
mountNotaInternaRoutes(router, PostrePedido, "Pedido de postre");

/**
 * Rutas de Pedidos de Postres (catálogo "Top postres").
 *
 * Flujo (análogo al de Galletas NY pero más simple — sin cajas ni stock):
 *   1. POST /checkout: valida items + entrega, crea pedido pending,
 *      crea Stripe Embedded Checkout Session con metadata.tipo = "postre".
 *   2. Webhook procesa checkout.session.completed:
 *        → marca estadoPago=paid, estado=confirmado
 *        → envía emails confirmación
 *        → crea evento en Calendar
 *      NO decrementa stock (los postres se hacen bajo pedido).
 *
 * Reutilizamos `validarFechaHora` y los `slots` de galletas porque la
 * regla de negocio es la misma (2 días hábiles, lun-sáb, mismos horarios).
 */

// ── POST /postrePedidos/checkout ──────────────────────────────────
// Crea el pedido en estado pending y devuelve el clientSecret del
// Stripe Embedded Checkout. Público (no requiere login).
router.post("/checkout", async (req, res) => {
  try {
    const {
      cliente,
      items,                 // [{ postreId, cantidad }]
      tipoEntrega,
      fechaEntrega,
      horaEntrega,
      direccionEnvio,
      notas,
    } = req.body || {};

    // ── 1) Validaciones básicas ──
    if (!cliente?.nombre || !cliente?.email || !cliente?.telefono) {
      return res.status(400).json({ message: "Datos del cliente incompletos (nombre, email, teléfono)" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Debes incluir al menos un postre" });
    }
    if (!["recogida", "envio"].includes(tipoEntrega)) {
      return res.status(400).json({ message: "tipoEntrega debe ser 'recogida' o 'envio'" });
    }

    // ── 2) Validar fecha + hora (reusa la lógica de galletas) ──
    const validacion = validarFechaHora({ fecha: fechaEntrega, hora: horaEntrega, tipoEntrega });
    if (!validacion.ok) {
      return res.status(400).json({ message: validacion.error });
    }
    if (await require("./dashboardAgenda").esFechaBloqueada(fechaEntrega)) {
      return res.status(409).json({ message: "Esa fecha no está disponible, elige otro día" });
    }

    // ── 3) Cargar postres referenciados (snapshot precio + nombre) ──
    const postreIds = [...new Set(items.map((it) => it.postreId).filter(Boolean))];
    if (postreIds.length === 0) {
      return res.status(400).json({ message: "Items inválidos: falta postreId" });
    }
    const postresDB = await Postre.find({ _id: { $in: postreIds }, activo: true });
    const postreMap = new Map(postresDB.map((p) => [String(p._id), p]));

    // ── 4) Validar cada item y construir snapshot ──
    const itemsNorm = [];
    let subtotalProductos = 0;
    for (const [idx, it] of items.entries()) {
      const p = postreMap.get(String(it.postreId));
      if (!p) {
        return res.status(400).json({ message: `Postre ${idx + 1} no disponible o eliminado` });
      }
      const cantidad = Number(it.cantidad);
      if (!cantidad || cantidad < 1) {
        return res.status(400).json({ message: `Cantidad inválida para "${p.nombre}"` });
      }
      const precioUnitario = Number(p.precio);
      const subtotal = Math.round(precioUnitario * cantidad * 100) / 100;
      itemsNorm.push({
        postreId:       p._id,
        slug:           p.slug,
        nombre:         p.nombre,
        precioUnitario,
        cantidad,
        subtotal,
      });
      subtotalProductos += subtotal;
    }
    subtotalProductos = Math.round(subtotalProductos * 100) / 100;

    // ── 5) Calcular costo de envío si aplica ──
    let costoEnvio = 0;
    let zonaResuelta = null;
    let direccionFinal = {};
    if (tipoEntrega === "envio") {
      if (!direccionEnvio?.calleNumero || !direccionEnvio?.colonia || !direccionEnvio?.municipio) {
        return res.status(400).json({ message: "Para envío necesitamos calle/número, colonia y municipio" });
      }
      zonaResuelta = resolverZona({
        colonia:   direccionEnvio.colonia,
        municipio: direccionEnvio.municipio,
      });
      if (!zonaResuelta || zonaResuelta.zona === "FUERA") {
        return res.status(400).json({ message: "No tenemos cobertura de envío en esa zona" });
      }
      costoEnvio = Number(zonaResuelta.costo) || 0;
      direccionFinal = {
        calleNumero:  direccionEnvio.calleNumero,
        colonia:      direccionEnvio.colonia,
        municipio:    direccionEnvio.municipio,
        referencias:  direccionEnvio.referencias || "",
        zona:         zonaResuelta.zona,
      };
    }

    const total = Math.round((subtotalProductos + costoEnvio) * 100) / 100;

    // ── 6) Generar número de orden ──
    const { numeroOrden, consecutivo } = await generarNumeroOrden("POS");

    // ── 7) Crear pedido pending ──
    const pedido = await PostrePedido.create({
      numeroOrden,
      consecutivo,
      cliente: {
        nombre:    cliente.nombre,
        email:     String(cliente.email).toLowerCase().trim(),
        telefono:  cliente.telefono,
        userId:    cliente.userId || null,
      },
      items: itemsNorm,
      subtotalProductos,
      costoEnvio,
      total,
      tipoEntrega,
      fechaEntrega: new Date(fechaEntrega),
      horaEntrega,
      direccionEnvio: direccionFinal,
      notas: (notas || "").slice(0, 500),
      estadoPago: "pending",
      estado:     "pendiente",
    });

    // ── 8) Crear sesión de Stripe Embedded Checkout ──
    const lineItems = itemsNorm.map((it) => ({
      price_data: {
        currency: "mxn",
        product_data: {
          name: `${it.nombre} × ${it.cantidad}`,
        },
        unit_amount: Math.round(it.precioUnitario * 100),
      },
      quantity: it.cantidad,
    }));
    if (costoEnvio > 0) {
      lineItems.push({
        price_data: {
          currency: "mxn",
          product_data: { name: `Envío — ${zonaResuelta.nombre}` },
          unit_amount: Math.round(costoEnvio * 100),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      locale: "es",
      line_items: lineItems,
      mode: "payment",
      return_url: `${FRONT_DOMAIN}/enduser/postres-confirmacion?session_id={CHECKOUT_SESSION_ID}`,
      customer_email: pedido.cliente.email,
      metadata: {
        tipo:        "postre",
        pedidoId:    String(pedido._id),
        numeroOrden: pedido.numeroOrden,
      },
    });

    pedido.stripeSessionId = session.id;
    await pedido.save();

    res.json({
      clientSecret: session.client_secret,
      numeroOrden:  pedido.numeroOrden,
      pedidoId:     pedido._id,
      total:        pedido.total,
    });
  } catch (error) {
    console.error("Error creando checkout postres:", error);
    res.status(500).json({ message: error.message || "Error creando el pedido" });
  }
});

// ── GET /postrePedidos/orden/:numeroOrden — público ────────────────
// Cualquiera con el número de orden puede consultar su estado. Whitelist
// de campos — no expone notasInternas ni datos sensibles del cliente.
router.get("/orden/:numeroOrden", async (req, res) => {
  try {
    const pedido = await PostrePedido.findOne({ numeroOrden: req.params.numeroOrden });
    if (!pedido) return res.status(404).json({ message: "Pedido no encontrado" });

    const safe = {
      numeroOrden:       pedido.numeroOrden,
      cliente:           { nombre: pedido.cliente.nombre },
      items:             pedido.items,
      subtotalProductos: pedido.subtotalProductos,
      costoEnvio:        pedido.costoEnvio,
      total:             pedido.total,
      tipoEntrega:       pedido.tipoEntrega,
      fechaEntrega:      pedido.fechaEntrega,
      horaEntrega:       pedido.horaEntrega,
      direccionEnvio:    pedido.direccionEnvio,
      estadoPago:        pedido.estadoPago,
      estado:            pedido.estado,
      createdAt:         pedido.createdAt,
    };
    res.json({ message: "Pedido", data: safe });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /postrePedidos — admin: listar todos ───────────────────────
router.get("/", checkRoleToken("admin"), async (req, res) => {
  try {
    const filter = {};
    if (req.query.estado)     filter.estado     = req.query.estado;
    if (req.query.estadoPago) filter.estadoPago = req.query.estadoPago;
    if (req.query.desde || req.query.hasta) {
      filter.fechaEntrega = {};
      if (req.query.desde) filter.fechaEntrega.$gte = new Date(req.query.desde);
      if (req.query.hasta) filter.fechaEntrega.$lte = new Date(req.query.hasta);
    }
    const pedidos = await PostrePedido.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit) || 200);
    res.json({ message: "Pedidos", data: pedidos });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /postrePedidos/:id — admin: detalle ────────────────────────
router.get("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const pedido = await PostrePedido.findById(req.params.id);
    if (!pedido) return res.status(404).json({ message: "Pedido no encontrado" });
    res.json({ message: "Pedido", data: pedido });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── PATCH /postrePedidos/:id/estado — admin: cambiar estado ────────
const ESTADOS_VALIDOS = ["pendiente", "confirmado", "en_preparacion", "listo", "entregado", "cancelado"];
router.patch("/:id/estado", checkRoleToken("admin"), async (req, res) => {
  try {
    const { estado } = req.body || {};
    if (!ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ message: `Estado debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}` });
    }
    const pedido = await PostrePedido.findById(req.params.id);
    if (!pedido) return res.status(404).json({ message: "Pedido no encontrado" });
    pedido.estado = estado;
    await pedido.save();
    res.json({ message: "Estado actualizado", data: pedido });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
