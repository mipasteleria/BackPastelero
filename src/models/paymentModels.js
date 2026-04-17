const mongoose = require("mongoose");

/**
 * PaymentData
 *
 * Un registro por intento de pago vía Stripe. Puede corresponder a un
 * anticipo (50%) o al pago total / liquidación de saldo de una cotización.
 *
 * Claves de diseño:
 *  - `stripeSessionId` es único e indexado: el webhook lo usa para
 *    encontrar el registro y marcarlo `paid` de forma idempotente.
 *  - `cotizacionId` + `cotizacionType` vinculan el pago a una cotización
 *    concreta (pastel | cupcake | snack). No usamos `refPath` de Mongoose
 *    para mantener la lógica explícita en un switch.
 *  - `amount` se guarda en **pesos** (no centavos) para ser consistente
 *    con los campos `precio`/`anticipo` del resto del sistema.
 *  - `status` está normalizado: "pending" | "paid" | "failed" | "expired".
 *    El default deja de ser "No aprobado" (string libre que no se podía
 *    consultar con seguridad).
 */
const PAYMENT_STATUSES = ["pending", "paid", "failed", "expired"];
const PAYMENT_OPTIONS = ["anticipo", "total", "saldo"];
const COTIZA_TYPES = ["Pastel", "Cupcake", "Snack"];

const PaymentSchema = new mongoose.Schema(
  {
    stripeSessionId: {
      type: String,
      index: true,
      unique: true,
      sparse: true,
    },
    stripePaymentIntentId: {
      type: String,
      index: true,
    },
    cotizacionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    cotizacionType: {
      type: String,
      enum: COTIZA_TYPES,
      required: true,
    },
    paymentOption: {
      type: String,
      enum: PAYMENT_OPTIONS,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "pending",
      index: true,
    },
    userId: {
      type: String,
      index: true,
    },
    email: {
      type: String,
    },
    name: {
      type: String,
    },
  },
  { timestamps: true }
);

const Payment = mongoose.model("PaymentData", PaymentSchema);

module.exports = Payment;
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
module.exports.PAYMENT_OPTIONS = PAYMENT_OPTIONS;
module.exports.COTIZA_TYPES = COTIZA_TYPES;
