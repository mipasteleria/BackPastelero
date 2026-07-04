require("dotenv").config();
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

const Payment = require("../../models/paymentModels");
const Pastel = require("../../models/pastelCotiza");
const Cupcake = require("../../models/cupcakesCotiza");
const Snack = require("../../models/snackCotiza");
const Personalizada = require("../../models/cotizacionPersonalizada");
const VintagePedido = require("../../models/vintage/pedido");
const GalletaPedido = require("../../models/galletaPedido");
const GalletaSabor  = require("../../models/galletaSabor");
const PostrePedido  = require("../../models/postrePedido");
const { sendGalletaConfirmation, sendGalletaConfirmationToAdmin, sendLowStockAlert } = require("./galletaEmails");
const { sendPostreConfirmation, sendPostreConfirmationToAdmin } = require("./postreEmails");
const { createGalletaEvent, createPostreEvent, createCotizacionEvent } = require("../../utils/googleCalendar");
const { syncPersonalizadaCalendar, syncVintageCalendar } = require("../../utils/pedidoCalendarSync");

/**
 * POST /webhook/stripe
 *
 * Recibe eventos firmados por Stripe y actualiza el estado del Payment y
 * de la cotización asociada.
 *
 * REQUISITOS DE MONTAJE (ver index.js):
 *  - Debe montarse con `express.raw({type: 'application/json'})` ANTES de
 *    `express.json()`. Stripe firma el body como bytes crudos; si pasa
 *    antes por JSON.parse, la verificación de firma falla siempre.
 *  - Configura `STRIPE_WEBHOOK_SECRET` en `.env` con el secreto que te da
 *    la CLI de Stripe al correr `stripe listen` o el dashboard al crear
 *    el endpoint.
 *
 * Eventos manejados:
 *  - checkout.session.completed → marca Payment "paid" + actualiza cotización
 *  - checkout.session.expired   → marca Payment "expired"
 *  - checkout.session.async_payment_failed → marca Payment "failed"
 *
 * Idempotencia: si el Payment ya está en estado final, devolvemos 200
 * sin re-procesar. Stripe reintenta hasta ~3 días si devuelves != 2xx.
 */
function getCotizaModel(type) {
  switch (type) {
    case "Pastel":
      return Pastel;
    case "Cupcake":
      return Cupcake;
    case "Snack":
      return Snack;
    case "Personalizada":
      return Personalizada;
    case "Vintage":
      return VintagePedido;
    default:
      return null;
  }
}

async function markPaymentFinal(session, finalStatus) {
  const payment = await Payment.findOne({ stripeSessionId: session.id });
  if (!payment) {
    console.warn(`[webhook] Payment no encontrado para session ${session.id}`);
    return;
  }
  if (payment.status === finalStatus) {
    // Ya procesado antes — no-op para idempotencia.
    return;
  }
  payment.status = finalStatus;
  if (session.payment_intent) {
    payment.stripePaymentIntentId = session.payment_intent;
  }
  await payment.save();

  if (finalStatus !== "paid") return;

  // Actualizar la cotización asociada.
  const Model = getCotizaModel(payment.cotizacionType);
  if (!Model) {
    console.warn(`[webhook] cotizacionType desconocido: ${payment.cotizacionType}`);
    return;
  }
  const cotizacion = await Model.findById(payment.cotizacionId);
  if (!cotizacion) {
    console.warn(`[webhook] Cotización no encontrada: ${payment.cotizacionId}`);
    return;
  }

  const precio = Number(cotizacion.precio) || 0;
  const anticipo = Number(cotizacion.anticipo) || 0;

  // Las cotizaciones personalizadas usan su propio set de estados; al pagar
  // el anticipo o total pasan directo a "Agendado · producción".
  const esPersonalizada = payment.cotizacionType === "Personalizada";

  if (payment.paymentOption === "total") {
    cotizacion.status = esPersonalizada ? "Agendado · producción" : "Agendado con el 100%";
    cotizacion.saldoPendiente = 0;
  } else if (payment.paymentOption === "anticipo") {
    cotizacion.status = esPersonalizada ? "Agendado · producción" : "Agendado con el 50%";
    cotizacion.saldoPendiente = Math.max(precio - anticipo, 0);
  } else if (payment.paymentOption === "saldo") {
    cotizacion.status = esPersonalizada ? "Agendado · producción" : "Agendado con el 100%";
    cotizacion.saldoPendiente = 0;
  }
  await cotizacion.save();

  // ── Crear evento en Google Calendar (idempotente) ──
  // Solo si la cotización aún no tiene calendarEventId (evita
  // duplicados cuando paga primero anticipo y después saldo).
  // En su propio try/catch para no romper el webhook si Calendar falla.
  if (!cotizacion.calendarEventId) {
    try {
      if (esPersonalizada) {
        syncPersonalizadaCalendar(Personalizada, cotizacion);
      } else if (payment.cotizacionType === "Vintage") {
        syncVintageCalendar(VintagePedido, cotizacion);
      } else {
        const eventId = await createCotizacionEvent(cotizacion, payment.cotizacionType);
        if (eventId) {
          cotizacion.calendarEventId = eventId;
          await cotizacion.save();
        }
      }
    } catch (e) {
      console.error(`[webhook] error creando evento Calendar para cotización ${cotizacion._id}:`, e.message);
    }
  }
}

router.post("/", async (req, res) => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET no está configurado");
    return res.status(500).send("Webhook secret no configurado");
  }

  let event;
  try {
    // req.body aquí es un Buffer porque index.js monta express.raw() sobre
    // esta ruta antes de express.json(). Si llegó parseado, la verificación
    // fallará y el catch devolverá 400.
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    console.error("[webhook] Firma inválida:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const session = event.data.object;
    // Las sesiones se distinguen por metadata.tipo. Galletas NY, postres
    // y cotizaciones tradicionales tienen lógica distinta.
    const tipoSession = session?.metadata?.tipo;
    const esGalletaNY = tipoSession === "galleta_ny";
    const esPostre    = tipoSession === "postre";
    const esCarrito   = tipoSession === "carrito";

    switch (event.type) {
      case "checkout.session.completed":
        if (esCarrito) {
          await procesarCarrito(session, "paid");
        } else if (esGalletaNY) {
          await procesarPedidoGalleta(session, "paid");
        } else if (esPostre) {
          await procesarPedidoPostre(session, "paid");
        } else {
          await markPaymentFinal(session, "paid");
        }
        break;
      case "checkout.session.expired":
        if (esCarrito) {
          await procesarCarrito(session, "failed");
        } else if (esGalletaNY) {
          await procesarPedidoGalleta(session, "failed");
        } else if (esPostre) {
          await procesarPedidoPostre(session, "failed");
        } else {
          await markPaymentFinal(session, "expired");
        }
        break;
      case "checkout.session.async_payment_failed":
        if (esCarrito) {
          await procesarCarrito(session, "failed");
        } else if (esGalletaNY) {
          await procesarPedidoGalleta(session, "failed");
        } else if (esPostre) {
          await procesarPedidoPostre(session, "failed");
        } else {
          await markPaymentFinal(session, "failed");
        }
        break;
      default:
        // Eventos no manejados: responder 200 para que Stripe no reintente.
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error("[webhook] Error procesando evento:", err);
    // 500 → Stripe reintentará. Solo devolver 500 si realmente queremos reintento.
    res.status(500).send("Error procesando webhook");
  }
});

/**
 * Procesa el resultado de una sesión de checkout de Galletas NY.
 *
 * Acciones cuando finalStatus === "paid":
 *   1) Marca el pedido como `estadoPago: paid`, `estado: confirmado`
 *   2) Decrementa el stock de cada sabor atómicamente ($inc -)
 *   3) Manda email de confirmación al cliente
 *   4) Si algún sabor queda con stock < 6, envía aviso al admin
 *
 * Idempotente: si el pedido ya está pagado y stockDescontado=true, no-op.
 */
async function procesarPedidoGalleta(session, finalStatus) {
  const pedidoId = session?.metadata?.pedidoId;
  if (!pedidoId) {
    console.warn(`[webhook galleta] session ${session.id} sin pedidoId`);
    return;
  }

  const pedido = await GalletaPedido.findById(pedidoId);
  if (!pedido) {
    console.warn(`[webhook galleta] Pedido no encontrado: ${pedidoId}`);
    return;
  }

  // Idempotencia: si ya está en el estado solicitado, no-op
  if (pedido.estadoPago === finalStatus && (finalStatus !== "paid" || pedido.stockDescontado)) {
    return;
  }

  pedido.estadoPago = finalStatus;
  if (session.payment_intent) {
    pedido.stripePaymentIntentId = session.payment_intent;
  }

  if (finalStatus !== "paid") {
    pedido.estado = "cancelado";
    await pedido.save();
    return;
  }

  // ── Pago confirmado: descontar stock atómicamente y notificar ──
  pedido.estado = "confirmado";

  // Agrupar piezas requeridas por slug en TODO el pedido
  const stockNeeded = {};
  pedido.cajas.forEach(c => c.items.forEach(it => {
    stockNeeded[it.saborSlug] = (stockNeeded[it.saborSlug] || 0) + it.cantidad;
  }));

  const stockBajo = []; // sabores que quedaron con stock < 6
  for (const [slug, qty] of Object.entries(stockNeeded)) {
    // $inc atómico — si dos webhooks corrieran al mismo tiempo, no se
    // sobrescriben el stock entre sí (cada uno aplica su propio delta).
    const sabor = await GalletaSabor.findOneAndUpdate(
      { slug },
      { $inc: { stock: -qty } },
      { new: true }
    );
    if (sabor && sabor.stock > 0 && sabor.stock < 6) {
      stockBajo.push(sabor);
    }
    if (sabor && sabor.stock < 0) {
      // Edge case: se vendió más de lo disponible (race en validación).
      // Lo dejamos en 0 para no falsear inventario.
      sabor.stock = 0;
      await sabor.save();
    }
  }

  pedido.stockDescontado = true;
  await pedido.save();

  // ── Email de confirmación al cliente ──
  try {
    await sendGalletaConfirmation(pedido);
  } catch (e) {
    console.error("[webhook galleta] error enviando email confirmación:", e.message);
  }

  // ── Email de aviso al admin (no bloquea si falla) ──
  try {
    await sendGalletaConfirmationToAdmin(pedido);
  } catch (e) {
    console.error("[webhook galleta] error enviando aviso al admin:", e.message);
  }

  // ── Crear evento en Google Calendar de la pastelería ──
  // No bloquea el webhook si falla; el evento se puede agregar manual desde
  // el detalle del pedido en el dashboard si fuera necesario.
  try {
    const eventId = await createGalletaEvent(pedido);
    if (eventId) {
      pedido.calendarEventId = eventId;
      await pedido.save();
    }
  } catch (e) {
    console.error("[webhook galleta] error creando evento en Calendar:", e.message);
  }

  // ── Aviso al admin si hay stock bajo ──
  if (stockBajo.length) {
    try {
      await sendLowStockAlert(stockBajo);
    } catch (e) {
      console.error("[webhook galleta] error enviando aviso stock bajo:", e.message);
    }
  }
}

/**
 * Procesa el resultado de una sesión de checkout de Postres.
 *
 * Acciones cuando finalStatus === "paid":
 *   1) Marca el pedido como `estadoPago: paid`, `estado: confirmado`
 *   2) Envía email de confirmación al cliente y aviso al admin
 *   3) Crea evento en Google Calendar
 *
 * A diferencia de galletas, NO descuenta stock (postres se hacen bajo pedido).
 *
 * Idempotente: si el pedido ya está en el estado solicitado, no-op.
 */
async function procesarPedidoPostre(session, finalStatus) {
  const pedidoId = session?.metadata?.pedidoId;
  if (!pedidoId) {
    console.warn(`[webhook postre] session ${session.id} sin pedidoId`);
    return;
  }

  const pedido = await PostrePedido.findById(pedidoId);
  if (!pedido) {
    console.warn(`[webhook postre] Pedido no encontrado: ${pedidoId}`);
    return;
  }

  if (pedido.estadoPago === finalStatus) return; // idempotencia

  pedido.estadoPago = finalStatus;
  if (session.payment_intent) {
    pedido.stripePaymentIntentId = session.payment_intent;
  }

  if (finalStatus !== "paid") {
    pedido.estado = "cancelado";
    await pedido.save();
    return;
  }

  pedido.estado = "confirmado";
  await pedido.save();

  // ── Emails (cada side-effect en su propio try/catch para que un fallo
  //    no rompa el resto del flujo) ──
  try {
    await sendPostreConfirmation(pedido);
  } catch (e) {
    console.error("[webhook postre] error enviando email confirmación:", e.message);
  }

  try {
    await sendPostreConfirmationToAdmin(pedido);
  } catch (e) {
    console.error("[webhook postre] error enviando aviso al admin:", e.message);
  }

  // ── Calendar event ──
  try {
    const eventId = await createPostreEvent(pedido);
    if (eventId) {
      pedido.calendarEventId = eventId;
      await pedido.save();
    }
  } catch (e) {
    console.error("[webhook postre] error creando evento en Calendar:", e.message);
  }
}

/**
 * Procesa una sesión de checkout del carrito unificado: confirma cada
 * pedido hijo (galletas / postres / vintage) reusando los flujos
 * individuales mediante una sesión sintética con el pedidoId adecuado.
 */
async function procesarCarrito(session, finalStatus) {
  const m = session?.metadata || {};
  const shim = (pedidoId) => ({ id: session.id, payment_intent: session.payment_intent, metadata: { pedidoId } });

  if (m.galletaPedidoId) {
    try { await procesarPedidoGalleta(shim(m.galletaPedidoId), finalStatus); }
    catch (e) { console.error("[webhook carrito] galletas:", e.message); }
  }
  if (m.postrePedidoId) {
    try { await procesarPedidoPostre(shim(m.postrePedidoId), finalStatus); }
    catch (e) { console.error("[webhook carrito] postres:", e.message); }
  }
  if (m.vintagePedidoId) {
    try {
      const pedido = await VintagePedido.findById(m.vintagePedidoId);
      if (pedido) {
        if (finalStatus === "paid") {
          pedido.status = "Agendado con el 100%";
          pedido.saldoPendiente = 0;
          await pedido.save();
          syncVintageCalendar(VintagePedido, pedido);
        } else {
          pedido.status = "Cancelado";
          await pedido.save();
        }
      }
    } catch (e) { console.error("[webhook carrito] vintage:", e.message); }
  }
}

module.exports = router;
