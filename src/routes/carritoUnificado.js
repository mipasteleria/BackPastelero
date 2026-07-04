require("dotenv").config();
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

const GalletaSabor = require("../models/galletaSabor");
const GalletaPedido = require("../models/galletaPedido");
const Postre = require("../models/postre");
const PostrePedido = require("../models/postrePedido");
const VintagePedido = require("../models/vintage/pedido");
const { cotizarVintage } = require("./vintage");
const { resolverZona } = require("../utils/zonasEnvio");
const { generarNumeroOrden } = require("../utils/orderNumber");
const { validarFechaHora } = require("../utils/galletaSlots");

const FRONT_DOMAIN = process.env.FRONT_DOMAIN;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Checkout unificado: galletas NY + postres + pastel vintage en un solo
 * pago. Crea cada pedido en su colección (pending) y una única sesión de
 * Stripe con todos los conceptos; el webhook (tipo "carrito") confirma
 * cada pedido en su flujo correspondiente. El envío se cobra UNA vez y se
 * registra en el primer pedido creado.
 */
router.post("/checkout", async (req, res) => {
  try {
    const { cliente, tipoEntrega, fechaEntrega, horaEntrega, direccionEnvio, notas, galletas, postres, vintage } = req.body || {};

    if (!cliente?.nombre || !cliente?.email || !cliente?.telefono) {
      return res.status(400).json({ message: "Datos del cliente incompletos (nombre, email, teléfono)" });
    }
    const tieneAlgo = (galletas?.cajas?.length || 0) + (postres?.items?.length || 0) + (vintage ? 1 : 0) > 0;
    if (!tieneAlgo) return res.status(400).json({ message: "El carrito está vacío" });
    if (!["recogida", "envio"].includes(tipoEntrega)) {
      return res.status(400).json({ message: "tipoEntrega debe ser 'recogida' o 'envio'" });
    }

    const validacion = validarFechaHora({ fecha: fechaEntrega, hora: horaEntrega, tipoEntrega });
    if (!validacion.ok) return res.status(400).json({ message: validacion.error });

    // ── Envío (una sola vez para todo el carrito) ──
    let costoEnvio = 0, zonaResuelta = null, direccionFinal = {};
    if (tipoEntrega === "envio") {
      if (!direccionEnvio?.calleNumero || !direccionEnvio?.colonia || !direccionEnvio?.municipio) {
        return res.status(400).json({ message: "Para envío necesitamos calle/número, colonia y municipio" });
      }
      zonaResuelta = resolverZona({ colonia: direccionEnvio.colonia, municipio: direccionEnvio.municipio });
      costoEnvio = Number(zonaResuelta.costo) || 0;
      direccionFinal = {
        calleNumero: direccionEnvio.calleNumero, colonia: direccionEnvio.colonia,
        municipio: direccionEnvio.municipio, referencias: direccionEnvio.referencias || "",
        zona: zonaResuelta.zona,
      };
    }

    const clienteDoc = {
      nombre: cliente.nombre,
      email: String(cliente.email).toLowerCase().trim(),
      telefono: cliente.telefono,
      userId: cliente.userId || null,
    };
    const lineItems = [];
    const creados = []; // para rollback si algo falla después
    let galletaPedido = null, postrePedido = null, vintagePedidoDoc = null;

    try {
      // ── Galletas NY (validación completa, igual que su checkout) ──
      if (galletas?.cajas?.length) {
        const cajas = galletas.cajas;
        const slugsUsados = new Set();
        cajas.forEach((c) => (c.items || []).forEach((it) => slugsUsados.add(it.saborSlug)));
        const saboresDB = await GalletaSabor.find({ slug: { $in: [...slugsUsados] }, activo: true });
        const saborMap = Object.fromEntries(saboresDB.map((s) => [s.slug, s]));

        const cajasNorm = [];
        const stockNeeded = {};
        for (const [idx, caja] of cajas.entries()) {
          const tamanoNum = caja.tamano === "12" ? 12 : caja.tamano === "6" ? 6 : null;
          if (!tamanoNum) throw new Error(`Caja ${idx + 1}: tamaño inválido`);
          const items = Array.isArray(caja.items) ? caja.items : [];
          const totalPiezas = items.reduce((s, it) => s + (Number(it.cantidad) || 0), 0);
          if (totalPiezas !== tamanoNum) throw new Error(`Caja ${idx + 1}: debe contener exactamente ${tamanoNum} galletas (tiene ${totalPiezas})`);
          const itemsNorm = [];
          let subtotal = 0;
          for (const it of items) {
            const s = saborMap[it.saborSlug];
            if (!s) throw new Error(`Sabor "${it.saborSlug}" no disponible`);
            const cant = Number(it.cantidad);
            if (!cant || cant < 1) throw new Error(`Cantidad inválida para "${s.nombre}"`);
            itemsNorm.push({ saborSlug: s.slug, saborNombre: s.nombre, cantidad: cant, precioUnitario: s.precio });
            subtotal += s.precio * cant;
            stockNeeded[s.slug] = (stockNeeded[s.slug] || 0) + cant;
          }
          cajasNorm.push({ tamano: caja.tamano, items: itemsNorm, subtotal, descuento: 0, total: subtotal });
        }
        for (const [slug, needed] of Object.entries(stockNeeded)) {
          if (saborMap[slug].stock < needed) throw new Error(`Stock insuficiente para "${saborMap[slug].nombre}"`);
        }
        const subtotalProductos = cajasNorm.reduce((s, c) => s + c.total, 0);
        const { numeroOrden, consecutivo } = await generarNumeroOrden("GNY");
        galletaPedido = await GalletaPedido.create({
          numeroOrden, consecutivo, cliente: clienteDoc,
          cajas: cajasNorm, subtotalProductos, costoEnvio: 0, total: subtotalProductos,
          tipoEntrega, fechaEntrega: new Date(fechaEntrega), horaEntrega,
          direccionEnvio: direccionFinal, notas: (notas || "").slice(0, 500),
          estadoPago: "pending", estado: "pendiente",
        });
        creados.push(galletaPedido);
        cajasNorm.forEach((caja, i) => {
          lineItems.push({
            price_data: {
              currency: "mxn",
              product_data: { name: `Galletas NY · Caja ${i + 1} — ${caja.tamano === "12" ? "Docena" : "Media docena"}`, description: caja.items.map((it) => `${it.cantidad}× ${it.saborNombre}`).join(", ").slice(0, 200) },
              unit_amount: Math.round(caja.total * 100),
            },
            quantity: 1,
          });
        });
      }

      // ── Postres ──
      if (postres?.items?.length) {
        const postreIds = [...new Set(postres.items.map((it) => it.postreId).filter(Boolean))];
        const postresDB = await Postre.find({ _id: { $in: postreIds }, activo: true });
        const postreMap = new Map(postresDB.map((p) => [String(p._id), p]));
        const itemsNorm = [];
        let subtotalProductos = 0;
        for (const [idx, it] of postres.items.entries()) {
          const p = postreMap.get(String(it.postreId));
          if (!p) throw new Error(`Postre ${idx + 1} no disponible`);
          const cantidad = Number(it.cantidad);
          if (!cantidad || cantidad < 1) throw new Error(`Cantidad inválida para "${p.nombre}"`);
          const subtotal = round2(Number(p.precio) * cantidad);
          itemsNorm.push({ postreId: p._id, slug: p.slug, nombre: p.nombre, precioUnitario: Number(p.precio), cantidad, subtotal });
          subtotalProductos += subtotal;
        }
        subtotalProductos = round2(subtotalProductos);
        const { numeroOrden, consecutivo } = await generarNumeroOrden("POS");
        postrePedido = await PostrePedido.create({
          numeroOrden, consecutivo, cliente: clienteDoc,
          items: itemsNorm, subtotalProductos, costoEnvio: 0, total: subtotalProductos,
          tipoEntrega, fechaEntrega: new Date(fechaEntrega), horaEntrega,
          direccionEnvio: direccionFinal, notas: (notas || "").slice(0, 500),
          estadoPago: "pending", estado: "pendiente",
        });
        creados.push(postrePedido);
        itemsNorm.forEach((it) => {
          lineItems.push({
            price_data: { currency: "mxn", product_data: { name: `Postre · ${it.nombre}` }, unit_amount: Math.round(it.precioUnitario * 100) },
            quantity: it.cantidad,
          });
        });
      }

      // ── Pastel Vintage (pago total en carrito) ──
      if (vintage) {
        const cot = await cotizarVintage(vintage);
        if (cot.total <= 0) throw new Error("No se pudo calcular el precio del pastel vintage");
        let numeroOrden = "";
        try { numeroOrden = (await generarNumeroOrden("VIN")).numeroOrden; } catch (_) {}
        vintagePedidoDoc = await VintagePedido.create({
          numeroOrden, userId: cliente.userId || "",
          seleccion: { ...vintage, porciones: cot.porciones },
          desglose: cot.items, totalProductos: cot.total, totalCosto: cot.totalCosto,
          envio: {
            tipo: tipoEntrega === "envio" ? "domicilio" : "recoger-local",
            zona: zonaResuelta?.zona || "", costo: 0,
            colonia: direccionFinal.colonia || "", municipio: direccionFinal.municipio || "",
            direccion: direccionFinal.calleNumero || "", hora: horaEntrega || "",
          },
          total: cot.total, precio: cot.total, anticipo: round2(cot.total * 0.5), saldoPendiente: 0,
          cliente: clienteDoc, fecha: new Date(fechaEntrega), notas: vintage.notas || "",
          status: "Pendiente",
        });
        creados.push(vintagePedidoDoc);
        lineItems.push({
          price_data: { currency: "mxn", product_data: { name: `Pastel Vintage ${numeroOrden}` }, unit_amount: Math.round(cot.total * 100) },
          quantity: 1,
        });
      }

      // ── Envío como concepto único ──
      if (costoEnvio > 0) {
        lineItems.push({
          price_data: { currency: "mxn", product_data: { name: `Envío — ${zonaResuelta.nombre}` }, unit_amount: Math.round(costoEnvio * 100) },
          quantity: 1,
        });
        // Registrarlo en el primer pedido para que el dashboard lo refleje.
        const primero = creados[0];
        if (primero) {
          primero.costoEnvio = costoEnvio;
          primero.total = round2((primero.total || primero.totalProductos || 0) + costoEnvio);
          if (primero.precio != null) primero.precio = primero.total;
          await primero.save();
        }
      }

      // ── Sesión única de Stripe (hosted) ──
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        locale: "es",
        line_items: lineItems,
        customer_email: clienteDoc.email,
        success_url: `${FRONT_DOMAIN}/enduser/carrito-confirmacion?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${FRONT_DOMAIN}/enduser/mi-carrito?pago=cancelado`,
        metadata: {
          tipo: "carrito",
          galletaPedidoId: galletaPedido ? String(galletaPedido._id) : "",
          postrePedidoId: postrePedido ? String(postrePedido._id) : "",
          vintagePedidoId: vintagePedidoDoc ? String(vintagePedidoDoc._id) : "",
        },
      });

      // Guardar referencia de sesión donde el esquema lo soporta.
      if (galletaPedido) { galletaPedido.stripeSessionId = session.id; await galletaPedido.save(); }
      if (postrePedido) { postrePedido.stripeSessionId = session.id; await postrePedido.save(); }

      res.json({
        url: session.url,
        ordenes: creados.map((p) => p.numeroOrden).filter(Boolean),
        total: round2(lineItems.reduce((s, li) => s + (li.price_data.unit_amount * li.quantity) / 100, 0)),
      });
    } catch (e) {
      // Rollback de los pedidos creados si la sesión no se pudo generar.
      for (const p of creados) { try { await p.deleteOne(); } catch (_) {} }
      throw e;
    }
  } catch (error) {
    console.error("Error en checkout de carrito:", error);
    res.status(400).json({ message: error.message || "Error creando el pedido" });
  }
});

module.exports = router;
