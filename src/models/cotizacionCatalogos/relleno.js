const mongoose = require("mongoose");

/**
 * Sabor del relleno para la cotización personalizada de pastel.
 *
 * El admin puede teclear el costo extra por porción manualmente
 * (`costoPorPorcion`) o vincular una Receta previamente cargada al
 * sistema para auto-costear (igual que los sabores del bizcocho):
 *
 * - Si `recetaId` está presente, el admin puede recostear y obtener
 *   un snapshot del costo unitario (receta.total_cost / receta.portions).
 * - Si no, `costoPorPorcion` se usa como fallback manual.
 *
 * En la maqueta esto pinta como un `.opt` simple con texto.
 */
const rellenoSchema = new mongoose.Schema(
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

    // ── Costeo ──────────────────────────────────────────────
    // Preferido: vincular a una Receta. El admin recostea cuando quiera
    // y se guarda el snapshot del costo unitario por porción.
    recetaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Receta",
      default: null,
    },
    costoUnitarioSnapshot: { type: Number, default: null, min: 0 },
    fechaCosteoSnapshot:   { type: Date, default: null },

    // Fallback: costo manual por porción — el admin lo ajusta a mano.
    costoPorPorcion: { type: Number, default: 0, min: 0 },

    activo: { type: Boolean, default: true },
    orden:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RellenoCotiza", rellenoSchema);
