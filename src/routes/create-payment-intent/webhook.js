require("dotenv").config();
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

const Payment = require("../../models/paymentModels");
const Pastel = require("../../models/pastelCotiza");
const Cupcake = require("../../models/cupcakesCotiza");
const Snack = require("../../models/snackCotiza");
const GalletaPedido = require("../../models/galletaPedido");
const GalletaSabor  = require("../../models/galletaSabor");
const { sendGalletaConfirmation, sendLowStockAlert } = require("./galletaEmails");

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

  if (payment.paymentOption === "total") {
    cotizacion.status = "Agendado con el 100%";
    cotizacion.saldoPendiente = 0;
  } else if (payment.paymentOption === "anticipo") {
    cotizacion.status = "Agendado con el 50%";
    cotizacion.saldoPendiente = Math.max(precio - anticipo, 0);
  } else if (payment.paymentOption === "saldo") {
    cotizacion.status = "Agendado con el 100%";
    cotizacion.saldoPendiente = 0;
  }
  await cotizacion.save();
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
    // Las sesiones de Galletas NY se distinguen por metadata.tipo. Las
    // cotizaciones tradicionales no traen ese campo, así que el switch
    // por tipo de evento sigue su flujo original.
    const esGalletaNY = session?.metadata?.tipo === "galleta_ny";

    switch (event.type) {
      case "checkout.session.completed":
        if (esGalletaNY) {
          await procesarPedidoGalleta(session, "paid");
        } else {
          await markPaymentFinal(session, "paid");
        }
        break;
      case "checkout.session.expired":
        if (esGalletaNY) {
          await procesarPedidoGalleta(session, "failed");
        } else {
          await markPaymentFinal(session, "expired");
        }
        break;
      case "checkout.session.async_payment_failed":
        if (esGalletaNY) {
          await procesarPedidoGalleta(session, "failed");
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

  // ── Aviso al admin si hay stock bajo ──
  if (stockBajo.length) {
    try {
      await sendLowStockAlert(stockBajo);
    } catch (e) {
      console.error("[webhook galleta] error enviando aviso stock bajo:", e.message);
    }
  }
}

module.exports = router;
