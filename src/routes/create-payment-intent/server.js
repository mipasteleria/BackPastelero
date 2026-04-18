require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const express = require("express");
const router = express.Router();
const { requireAuth } = require("../../middlewares/myRoleToken.js");

const FRONT_DOMAIN = process.env.FRONT_DOMAIN;
const Payment = require("../../models/paymentModels");
const Pastel = require("../../models/pastelCotiza");
const Cupcake = require("../../models/cupcakesCotiza");
const Snack = require("../../models/snackCotiza");

const { PAYMENT_OPTIONS, COTIZA_TYPES } = Payment;

/**
 * Resuelve el modelo Mongoose según el tipo de cotización.
 * Mantenemos el switch explícito (en lugar de refPath) porque son solo
 * 3 tipos y la intención queda visible en código.
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
 * POST /checkout/create-checkout-session
 *
 * Body esperado:
 *   {
 *     cotizacionId: "<ObjectId>",
 *     cotizacionType: "Pastel" | "Cupcake" | "Snack",
 *     paymentOption: "anticipo" | "total" | "saldo"
 *   }
 *
 * IMPORTANTE: el monto NUNCA viene del cliente — se calcula en el servidor
 * leyendo la cotización. Así un usuario malicioso no puede pagar $1 MXN
 * por un pastel de $3000.
 *
 * Reglas de idempotencia:
 *   - Si la cotización ya tiene un Payment con status "paid" y
 *     paymentOption "total" → error (ya pagado).
 *   - Si piden "anticipo" y ya hay un anticipo "paid" → error
 *     (deben usar "saldo" para liquidar).
 *   - Si piden "saldo" y no existe anticipo previo → error.
 */
router.post("/create-checkout-session", requireAuth, async (req, res) => {
  try {
    const { cotizacionId, cotizacionType, paymentOption } = req.body;

    if (!cotizacionId || !cotizacionType || !paymentOption) {
      return res.status(400).json({
        message: "Faltan campos: cotizacionId, cotizacionType, paymentOption",
      });
    }
    if (!COTIZA_TYPES.includes(cotizacionType)) {
      return res.status(400).json({
        message: `cotizacionType inválido. Use: ${COTIZA_TYPES.join(", ")}`,
      });
    }
    if (!PAYMENT_OPTIONS.includes(paymentOption)) {
      return res.status(400).json({
        message: `paymentOption inválido. Use: ${PAYMENT_OPTIONS.join(", ")}`,
      });
    }

    const Model = getCotizaModel(cotizacionType);
    const cotizacion = await Model.findById(cotizacionId);
    if (!cotizacion) {
      return res.status(404).json({ message: "Cotización no encontrada" });
    }

    // El usuario autenticado debe ser dueño de la cotización.
    // (Admins podrán pagar en nombre del cliente desde el dashboard, lo
    // añadiremos más adelante cuando hagamos el flujo admin.)
    if (cotizacion.userId && cotizacion.userId !== String(req.user._id)) {
      return res.status(403).json({ message: "No eres dueño de esta cotización" });
    }

    const precio = Number(cotizacion.precio);
    const anticipoMonto = Number(cotizacion.anticipo);
    if (!precio || precio <= 0) {
      return res.status(400).json({
        message: "La cotización no tiene precio definido por el admin",
      });
    }

    // Determinar monto + reglas de idempotencia consultando pagos previos.
    const previosPaid = await Payment.find({
      cotizacionId,
      cotizacionType,
      status: "paid",
    });
    const anticipoPagado = previosPaid.find((p) => p.paymentOption === "anticipo");
    const totalPagado = previosPaid.find(
      (p) => p.paymentOption === "total" || p.paymentOption === "saldo"
    );

    let amount;
    if (paymentOption === "total") {
      if (totalPagado || anticipoPagado) {
        return res.status(409).json({
          message: "Esta cotización ya tiene pagos registrados. Usa 'saldo' si corresponde.",
        });
      }
      amount = precio;
    } else if (paymentOption === "anticipo") {
      if (anticipoPagado) {
        return res.status(409).json({
          message: "Ya se pagó el anticipo. Usa paymentOption='saldo' para liquidar.",
        });
      }
      if (!anticipoMonto || anticipoMonto <= 0) {
        return res.status(400).json({
          message: "La cotización no tiene anticipo definido",
        });
      }
      amount = anticipoMonto;
    } else if (paymentOption === "saldo") {
      if (!anticipoPagado) {
        return res.status(409).json({
          message: "No existe anticipo previo para liquidar",
        });
      }
      if (totalPagado) {
        return res.status(409).json({
          message: "Esta cotización ya está totalmente pagada",
        });
      }
      amount = precio - anticipoMonto;
      if (amount <= 0) {
        return res.status(400).json({
          message: "El saldo calculado no es positivo",
        });
      }
    }

    const productLabel = `${cotizacionType} (${paymentOption}) - cotización ${cotizacionId}`;

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      line_items: [
        {
          price_data: {
            currency: "mxn",
            product_data: { name: productLabel },
            unit_amount: Math.round(amount * 100), // Stripe usa centavos
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      return_url: `${FRONT_DOMAIN}/enduser/return?session_id={CHECKOUT_SESSION_ID}`,
      metadata: {
        cotizacionId: String(cotizacionId),
        cotizacionType,
        paymentOption,
        userId: String(req.user._id),
      },
    });

    await Payment.create({
      stripeSessionId: session.id,
      cotizacionId,
      cotizacionType,
      paymentOption,
      amount,
      status: "pending",
      userId: String(req.user._id),
      email: req.user.email,
      name: req.user.name,
    });

    res.send({ clientSecret: session.client_secret });
  } catch (error) {
    console.error("Error al crear la sesión de checkout:", error);
    res.status(500).json({ message: "Error al crear la sesión de checkout" });
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
