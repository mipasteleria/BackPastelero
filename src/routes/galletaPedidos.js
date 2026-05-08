require("dotenv").config();
const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const GalletaSabor   = require("../models/galletaSabor");
const GalletaPedido  = require("../models/galletaPedido");
const checkRoleToken = require("../middlewares/myRoleToken");
const { generarNumeroOrden } = require("../utils/orderNumber");
const { resolverZona, ZONAS } = require("../utils/zonasEnvio");
const { validarFechaHora, getSlotsValidos } = require("../utils/galletaSlots");
const { createGalletaEvent, deleteEvent } = require("../utils/googleCalendar");

const FRONT_DOMAIN = process.env.FRONT_DOMAIN;

/**
 * Rutas de Pedidos de Galletas NY.
 *
 * Flujo de checkout:
 *   1. Frontend POST /galletaPedidos/checkout con cart + cliente + entrega
 *   2. Server valida stock, fecha/hora, calcula totales, crea pedido pending
 *   3. Server crea Stripe Checkout Session con metadata.tipo = "galleta_ny"
 *   4. Webhook procesa el evento checkout.session.completed:
 *        → decrementa stock atómicamente
 *        → marca estadoPago=paid, estado=confirmado
 *        → manda email de confirmación
 *
 * El stock se decrementa SOLO al confirmarse el pago — así no se "bloquean"
 * piezas si el cliente abandona el checkout.
 */

// ── GET /galletaPedidos/zonas ───────────────────────────────────────
// Catálogo de zonas y tarifas. Público — el frontend lo usa para mostrar
// las opciones de envío y precios sin tener que codearlas duplicadas.
router.get("/zonas", (req, res) => {
  res.json({ message: "Zonas de envío", data: ZONAS });
});

// ── POST /galletaPedidos/cotizar-envio ──────────────────────────────
// Body: { colonia, municipio }. Devuelve la zona + costo.
// Público — se llama en vivo desde el checkout para mostrar el precio.
router.post("/cotizar-envio", (req, res) => {
  const { colonia, municipio } = req.body || {};
  if (!colonia && !municipio) {
    return res.status(400).json({ message: "Envía colonia y/o municipio" });
  }
  const zona = resolverZona({ colonia, municipio });
  res.json({ message: "Zona resuelta", data: zona });
});

// ── GET /galletaPedidos/slots ───────────────────────────────────────
// Devuelve los slots horarios disponibles según tipo de entrega.
// Query: ?tipo=recogida|envio
router.get("/slots", (req, res) => {
  const tipo = req.query.tipo === "envio" ? "envio" : "recogida";
  res.json({ message: "Slots disponibles", data: getSlotsValidos(tipo) });
});

// ── POST /galletaPedidos/checkout ───────────────────────────────────
// Crea el pedido en estado pending y devuelve la URL/clientSecret del
// checkout de Stripe. Público (no requiere login para recogida).
router.post("/checkout", async (req, res) => {
  try {
    const {
      cliente,        // { nombre, email, telefono, userId? }
      cajas,          // [{ tamano: "6"|"12", items: [{ saborSlug, cantidad }] }]
      tipoEntrega,    // "recogida" | "envio"
      fechaEntrega,   // ISO string
      horaEntrega,    // "HH:MM"
      direccionEnvio, // { calleNumero, colonia, municipio, referencias } — solo si envío
      notas,
    } = req.body || {};

    // ── 1) Validaciones básicas ──
    if (!cliente?.nombre || !cliente?.email || !cliente?.telefono) {
      return res.status(400).json({
        message: "Datos del cliente incompletos (nombre, email, teléfono)",
      });
    }
    if (!Array.isArray(cajas) || cajas.length === 0) {
      return res.status(400).json({ message: "Debes incluir al menos una caja" });
    }
    if (!["recogida", "envio"].includes(tipoEntrega)) {
      return res.status(400).json({ message: "tipoEntrega debe ser 'recogida' o 'envio'" });
    }

    // ── 2) Validar fecha + hora ──
    const validacion = validarFechaHora({
      fecha: fechaEntrega,
      hora: horaEntrega,
      tipoEntrega,
    });
    if (!validacion.ok) {
      return res.status(400).json({ message: validacion.error });
    }

    // ── 3) Cargar todos los sabores referenciados (snapshot precio + nombre) ──
    const slugsUsados = new Set();
    cajas.forEach(c => (c.items || []).forEach(it => slugsUsados.add(it.saborSlug)));
    const saboresDB = await GalletaSabor.find({
      slug: { $in: [...slugsUsados] },
      activo: true,
    });
    const saborMap = Object.fromEntries(saboresDB.map(s => [s.slug, s]));

    // ── 4) Validar cada caja: tamaño exacto, items existen, stock suficiente ──
    const cajasNormalizadas = [];
    const stockNeeded = {}; // slug → cantidad total requerida en este pedido

    for (const [idx, caja] of cajas.entries()) {
      const tamanoNum = caja.tamano === "12" ? 12 : caja.tamano === "6" ? 6 : null;
      if (!tamanoNum) {
        return res.status(400).json({ message: `Caja ${idx + 1}: tamaño inválido` });
      }
      const items = Array.isArray(caja.items) ? caja.items : [];
      const totalPiezas = items.reduce((s, it) => s + (Number(it.cantidad) || 0), 0);
      if (totalPiezas !== tamanoNum) {
        return res.status(400).json({
          message: `Caja ${idx + 1}: debe contener exactamente ${tamanoNum} galletas (tiene ${totalPiezas})`,
        });
      }

      const itemsNorm = [];
      let subtotalCaja = 0;
      for (const it of items) {
        const s = saborMap[it.saborSlug];
        if (!s) {
          return res.status(400).json({
            message: `Sabor "${it.saborSlug}" no disponible`,
          });
        }
        const cant = Number(it.cantidad);
        if (!cant || cant < 1) {
          return res.status(400).json({
            message: `Cantidad inválida para "${s.nombre}"`,
          });
        }
        itemsNorm.push({
          saborSlug:      s.slug,
          saborNombre:    s.nombre,
          cantidad:       cant,
          precioUnitario: s.precio,
        });
        subtotalCaja += s.precio * cant;
        stockNeeded[s.slug] = (stockNeeded[s.slug] || 0) + cant;
      }

      // Sin descuentos automáticos — se reserva el campo para futuros
      // códigos promocionales aplicados por el admin.
      const descuento = 0;
      cajasNormalizadas.push({
        tamano:    caja.tamano,
        items:     itemsNorm,
        subtotal:  subtotalCaja,
        descuento,
        total:     subtotalCaja - descuento,
      });
    }

    // ── 5) Validar stock global suficiente ──
    for (const [slug, needed] of Object.entries(stockNeeded)) {
      const s = saborMap[slug];
      if (s.stock < needed) {
        return res.status(409).json({
          message: `Stock insuficiente para "${s.nombre}": solicitas ${needed}, hay ${s.stock}`,
          slug,
          disponible: s.stock,
          solicitado: needed,
        });
      }
    }

    // ── 6) Calcular costo de envío si aplica ──
    let costoEnvio = 0;
    let zonaResuelta = null;
    let direccionFinal = {};

    if (tipoEntrega === "envio") {
      if (!direccionEnvio?.calleNumero || !direccionEnvio?.colonia || !direccionEnvio?.municipio) {
        return res.status(400).json({
          message: "Para envío necesitamos calle/número, colonia y municipio",
        });
      }
      zonaResuelta = resolverZona({
        colonia:   direccionEnvio.colonia,
        municipio: direccionEnvio.municipio,
      });
      costoEnvio = zonaResuelta.costo;
      direccionFinal = {
        calleNumero:  direccionEnvio.calleNumero,
        colonia:      direccionEnvio.colonia,
        municipio:    direccionEnvio.municipio,
        referencias:  direccionEnvio.referencias || "",
        zona:         zonaResuelta.zona,
      };
    }

    const subtotalProductos = cajasNormalizadas.reduce((s, c) => s + c.total, 0);
    const total = subtotalProductos + costoEnvio;

    // ── 7) Generar número de orden ──
    const { numeroOrden, consecutivo } = await generarNumeroOrden("GNY");

    // ── 8) Crear pedido en estado pending ──
    const pedido = await GalletaPedido.create({
      numeroOrden,
      consecutivo,
      cliente: {
        nombre:    cliente.nombre,
        email:     String(cliente.email).toLowerCase().trim(),
        telefono:  cliente.telefono,
        userId:    cliente.userId || null,
      },
      cajas: cajasNormalizadas,
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

    // ── 9) Crear sesión de Stripe ──
    const lineItems = [];
    cajasNormalizadas.forEach((caja, i) => {
      const tamanoLabel = caja.tamano === "12" ? "Docena" : "Media docena";
      const sabores = caja.items.map(it => `${it.cantidad}× ${it.saborNombre}`).join(", ");
      lineItems.push({
        price_data: {
          currency: "mxn",
          product_data: {
            name: `Caja ${i + 1} — ${tamanoLabel}`,
            description: sabores.slice(0, 200),
          },
          unit_amount: Math.round(caja.total * 100),
        },
        quantity: 1,
      });
    });
    if (costoEnvio > 0) {
      lineItems.push({
        price_data: {
          currency: "mxn",
          product_data: {
            name: `Envío — ${zonaResuelta.nombre}`,
          },
          unit_amount: Math.round(costoEnvio * 100),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      line_items: lineItems,
      mode: "payment",
      return_url: `${FRONT_DOMAIN}/enduser/galletas-confirmacion?session_id={CHECKOUT_SESSION_ID}`,
      customer_email: pedido.cliente.email,
      metadata: {
        tipo:        "galleta_ny",
        pedidoId:    String(pedido._id),
        numeroOrden: pedido.numeroOrden,
      },
    });

    // Guardar referencia de Stripe en el pedido para luego matchear el webhook.
    pedido.stripeSessionId = session.id;
    await pedido.save();

    res.json({
      clientSecret: session.client_secret,
      numeroOrden:  pedido.numeroOrden,
      pedidoId:     pedido._id,
      total:        pedido.total,
    });
  } catch (error) {
    console.error("Error creando checkout galletas:", error);
    res.status(500).json({ message: error.message || "Error creando el pedido" });
  }
});

// ── GET /galletaPedidos/orden/:numeroOrden ──────────────────────────
// Cualquiera con el número de orden puede consultar su estado (no expone
// info sensible — solo lo necesario para el cliente: detalle, estado,
// fecha de entrega).
router.get("/orden/:numeroOrden", async (req, res) => {
  try {
    const pedido = await GalletaPedido.findOne({ numeroOrden: req.params.numeroOrden });
    if (!pedido) return res.status(404).json({ message: "Pedido no encontrado" });

    // Filtrar campos sensibles
    const safe = {
      numeroOrden:       pedido.numeroOrden,
      cliente:           { nombre: pedido.cliente.nombre },
      cajas:             pedido.cajas,
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

// ── GET /galletaPedidos — admin: listar todos ──────────────────────
// Query: ?estado=confirmado|pendiente|... ?desde=ISO ?hasta=ISO
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
    const pedidos = await GalletaPedido.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit) || 200);
    res.json({ message: "Pedidos", data: pedidos });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── GET /galletaPedidos/:id — admin: detalle ───────────────────────
router.get("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const pedido = await GalletaPedido.findById(req.params.id);
    if (!pedido) return res.status(404).json({ message: "Pedido no encontrado" });
    res.json({ message: "Pedido", data: pedido });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── PATCH /galletaPedidos/:id/estado — admin: cambiar estado ───────
// Side effects sobre Google Calendar:
//   - Si se cancela y existe evento en Calendar → se elimina
//   - Si se confirma y NO existe evento (vino por flujo manual) → se crea
const ESTADOS_VALIDOS = ["pendiente", "confirmado", "en_preparacion", "listo", "entregado", "cancelado"];
router.patch("/:id/estado", checkRoleToken("admin"), async (req, res) => {
  try {
    const { estado } = req.body || {};
    if (!ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ message: `Estado debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}` });
    }
    const pedidoActual = await GalletaPedido.findById(req.params.id);
    if (!pedidoActual) return res.status(404).json({ message: "Pedido no encontrado" });

    const estadoAnterior = pedidoActual.estado;
    pedidoActual.estado = estado;
    await pedidoActual.save();

    // ── Sincronizar Google Calendar (sin bloquear la respuesta) ──
    // Cancelado → borrar evento si existe
    if (estado === "cancelado" && pedidoActual.calendarEventId) {
      deleteEvent(pedidoActual.calendarEventId)
        .then(async () => {
          await GalletaPedido.findByIdAndUpdate(pedidoActual._id, {
            $set: { calendarEventId: "" },
          });
        })
        .catch(e => console.error("[gcal] error en delete async:", e.message));
    }
    // Confirmado y aún sin evento → crearlo
    else if (
      ["confirmado", "en_preparacion", "listo"].includes(estado) &&
      !pedidoActual.calendarEventId &&
      pedidoActual.estadoPago === "paid"
    ) {
      createGalletaEvent(pedidoActual)
        .then(async (eventId) => {
          if (eventId) {
            await GalletaPedido.findByIdAndUpdate(pedidoActual._id, {
              $set: { calendarEventId: eventId },
            });
          }
        })
        .catch(e => console.error("[gcal] error en create async:", e.message));
    }

    res.json({ message: "Estado actualizado", data: pedidoActual });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
