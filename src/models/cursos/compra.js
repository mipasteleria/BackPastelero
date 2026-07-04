const mongoose = require("mongoose");

/**
 * Acceso de un usuario a un curso.
 *
 * Hoy: pago único por curso (tipoAcceso "compra", sin expiración).
 * Diseñado para crecer a suscripción: una membresía activa insertaría
 * accesos tipo "suscripcion" con `expiraAt`, y la verificación de acceso
 * ya contempla ambos.
 */
const compraSchema = new mongoose.Schema(
  {
    cursoId: { type: mongoose.Schema.Types.ObjectId, ref: "Curso", required: true, index: true },
    userId:  { type: String, default: "", index: true },
    email:   { type: String, default: "", lowercase: true, trim: true, index: true },

    tipoAcceso: { type: String, enum: ["compra", "suscripcion", "cortesia"], default: "compra" },
    expiraAt:   { type: Date, default: null }, // null = sin expiración

    precio: { type: Number, default: 0 },
    stripeSessionId: { type: String, default: "", index: true },
    status: { type: String, enum: ["pending", "paid", "failed", "expired"], default: "pending" },
  },
  { timestamps: true }
);

compraSchema.index({ cursoId: 1, email: 1 });

module.exports = mongoose.model("CursoCompra", compraSchema);
