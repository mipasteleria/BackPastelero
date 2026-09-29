require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const express = require("express");
const router = express.Router();
const { requireAuth } = require("../../middlewares/myRoleToken.js");

const FRONT_DOMAIN = process.env.FRONT_DOMAIN;
const Payment = require("../../models/paymentModels");
const Personalizada = require("../../models/cotizacionPersonalizada");
const VintagePedido = require("../../models/vintage/pedido");

const { PAYMENT_OPTIONS, COTIZA_TYPES } = Payment;


/**
 * POST /checkout/vintage-checkout
 * Body: { pedidoId, paymentOption: "anticipo" | "total" }
 * Pago de un Pastel Vintage (Stripe hosted). Monto calculado en servidor.
 */
router.post("/vintage-checkout", async (req, res) => {
  try {
    // `token` permite pagar desde el enlace público (sin cuenta).
    const { pedidoId, paymentOption, token } = req.body;
    if (!["anticipo", "total", "saldo"].includes(paymentOption)) {
      return res.status(400).json({ message: "Datos inválidos" });
    }
    const pedido = token
      ? await VintagePedido.findOne({ publicToken: token })
      : (pedidoId ? await VintagePedido.findById(pedidoId) : null);
    if (!pedido) return res.status(404).json({ message: "Pedido no encontrado" });

    const precio = Number(pedido.total) || 0;
    if (precio <= 0) return res.status(400).json({ message: "El pedido no tiene total" });
    const anticipo = pedido.anticipo != null ? Number(pedido.anticipo) : Math.round(precio * 0.5);

    // El saldo es un SEGUNDO pago legítimo, así que solo bloqueamos pagos
    // repetidos cuando se intenta volver a cobrar el anticipo o el total.
    if (paymentOption !== "saldo") {
      const previosPaid = await Payment.find({ cotizacionId: pedido._id, cotizacionType: "Vintage", status: "paid" });
      if (previosPaid.length) return res.status(409).json({ message: "Este pedido ya tiene pagos." });
    }

    const saldo = Number(pedido.saldoPendiente) || 0;
    if (paymentOption === "saldo" && saldo <= 0) {
      return res.status(409).json({ message: "Este pedido ya está pagado por completo." });
    }

    const amount = paymentOption === "total" ? precio : paymentOption === "saldo" ? saldo : anticipo;
    const returnTo = pedido.publicToken
      ? `${FRONT_DOMAIN}/vintage/ver/${pedido.publicToken}?pago=ok`
      : `${FRONT_DOMAIN}/enduser/pastel-vintage?pedido=${pedido._id}&pago=ok`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "es",
      customer_email: pedido.cliente?.email || undefined,
      line_items: [{
        price_data: {
          currency: "mxn",
          product_data: { name: `Pastel Vintage (${paymentOption}) ${pedido.numeroOrden || ""}` },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      success_url: returnTo,
      cancel_url: pedido.publicToken
        ? `${FRONT_DOMAIN}/vintage/ver/${pedido.publicToken}?pago=cancelado`
        : `${FRONT_DOMAIN}/enduser/pastel-vintage?pago=cancelado`,
      metadata: { cotizacionId: String(pedido._id), cotizacionType: "Vintage", paymentOption, userId: pedido.userId || "" },
    });

    await Payment.create({
      stripeSessionId: session.id, cotizacionId: pedido._id, cotizacionType: "Vintage",
      paymentOption, amount, status: "pending", userId: pedido.userId || "",
      email: pedido.cliente?.email || "", name: pedido.cliente?.nombre || "",
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error("Error checkout vintage:", e);
    res.status(500).json({ message: e.message });
  }
});

/**
 * POST /checkout/create-checkout-session-public
 *
 * Checkout para cotizaciones personalizadas vía enlace de invitado (sin
 * login). Autoriza por `publicToken` — quien tiene el enlace puede pagar.
 * Usa Stripe Checkout hosted (redirección) para no requerir sesión auth en
 * el cliente. Soporta paymentOption "anticipo" (50%) y "saldo".
 *
 * Body: { token, paymentOption }
 */
router.post("/create-checkout-session-public", async (req, res) => {
  try {
    const { token, paymentOption } = req.body;
    if (!token || !paymentOption) {
      return res.status(400).json({ message: "Faltan campos: token, paymentOption" });
    }
    if (!["anticipo", "saldo", "total"].includes(paymentOption)) {
      return res.status(400).json({ message: "paymentOption inválido" });
    }

    const cot = await Personalizada.findOne({ publicToken: token });
    if (!cot) return res.status(404).json({ message: "Cotización no encontrada" });

    const precio = Number(cot.precio);
    if (!precio || precio <= 0) {
      return res.status(400).json({ message: "La cotización aún no tiene precio definido" });
    }

    // Anticipo: usar el del admin o, si falta, 50% del precio (y persistir
    // para que el webhook calcule bien el saldo).
    let anticipoMonto = Number(cot.anticipo);
    if (!anticipoMonto || anticipoMonto <= 0) {
      anticipoMonto = Math.round(precio * 0.5 * 100) / 100;
      cot.anticipo = anticipoMonto;
      await cot.save();
    }

    const cotizacionType = "Personalizada";
    const previosPaid = await Payment.find({ cotizacionId: cot._id, cotizacionType, status: "paid" });
    const anticipoPagado = previosPaid.find((p) => p.paymentOption === "anticipo");
    const totalPagado = previosPaid.find((p) => p.paymentOption === "total" || p.paymentOption === "saldo");

    let amount;
    if (paymentOption === "total") {
      if (totalPagado || anticipoPagado) return res.status(409).json({ message: "Esta cotización ya tiene pagos." });
      amount = precio;
    } else if (paymentOption === "anticipo") {
      if (anticipoPagado) return res.status(409).json({ message: "El anticipo ya fue pagado. Usa 'saldo'." });
      amount = anticipoMonto;
    } else { // saldo
      if (!anticipoPagado) return res.status(409).json({ message: "No existe anticipo previo." });
      if (totalPagado) return res.status(409).json({ message: "Ya está totalmente pagada." });
      amount = precio - anticipoMonto;
      if (amount <= 0) return res.status(400).json({ message: "Saldo no positivo." });
    }

    const productLabel = `Cotización personalizada (${paymentOption})`;
    const returnTo = `${FRONT_DOMAIN}/cotizacion/ver/${token}?pago=ok`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "es",
      customer_email: cot.cliente?.email || undefined,
      line_items: [
        {
          price_data: {
            currency: "mxn",
            product_data: { name: productLabel },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      success_url: returnTo,
      cancel_url: `${FRONT_DOMAIN}/cotizacion/ver/${token}?pago=cancelado`,
      metadata: {
        cotizacionId: String(cot._id),
        cotizacionType,
        paymentOption,
        userId: cot.userId || "",
      },
    });

    await Payment.create({
      stripeSessionId: session.id,
      cotizacionId: cot._id,
      cotizacionType,
      paymentOption,
      amount,
      status: "pending",
      userId: cot.userId || "",
      email: cot.cliente?.email || "",
      name: cot.cliente?.nombre || "",
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error("Error creando checkout público:", e);
    res.status(500).json({ message: e.message });
  }
});

// Redirige al dominio frontal (endpoint legacy, se mantiene)
router.get("/", (req, res) => {
  try {
    res.redirect(FRONT_DOMAIN + req.originalUrl);
  } catch (error) {
    console.error("Error en la redirección:", error);
    res.status(500).json({ message: "Error al redirigir al dominio frontal" });
  }
});


/**
 * GET /checkout/session-status?session_id=...
 *
 * El front lo usa para pintar la página de "return" después de Stripe.
 * La fuente de verdad sigue siendo el webhook — esto es solo UX.
 */
router.get("/session-status", requireAuth, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
    const payment = await Payment.findOne({ stripeSessionId: session.id });

    res.send({
      status: session.status,
      payment_status: session.payment_status,
      customer_email: session.customer_details?.email,
      cotizacionId: payment?.cotizacionId,
      cotizacionType: payment?.cotizacionType,
      paymentOption: payment?.paymentOption,
    });
  } catch (error) {
    console.error("Error al obtener el estado de la sesión:", error);
    res.status(500).json({ message: "Error al obtener el estado de la sesión" });
  }
});

module.exports = router;
