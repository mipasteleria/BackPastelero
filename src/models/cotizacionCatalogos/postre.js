const mongoose = require("mongoose");

/**
 * Postre individual para la cotización de "Mesa de postres".
 *
 * Catálogo multi-select (el cliente arma su mesa eligiendo varios postres:
 * brownie, macarrones, donas, etc.). El admin los da de alta desde el
 * dashboard. El costo se resuelve igual que los sabores del pastel:
 *
 * - Si `recetaId` está presente, el admin recostea y se congela el costo
 *   unitario por porción (receta.total_cost / receta.portions).
 * - Si no, `costoManual` (por porción) se usa como fallback.
 *
 * En el front pinta como un `.deco` (emoji + nombre) multi-select, igual
 * que las decoraciones del pastel.
 */
const postreSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, "Slug solo permite minúsculas, números y guiones"],
    },
    nombre:      { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true, default: "" },
    emoji:       { type: String, default: "🍰" },

    // ── Costeo ──────────────────────────────────────────────
    // Preferido: vincular a una Receta y recostear.
    recetaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Receta",
      default: null,
    },
    costoUnitarioSnapshot: { type: Number, default: null, min: 0 },
    fechaCosteoSnapshot:   { type: Date, default: null },

    // Fallback: costo manual por porción (por pieza de postre).
    costoManual: { type: Number, default: 0, min: 0 },

    activo: { type: Boolean, default: true },
    orden:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PostreCotiza", postreSchema);
