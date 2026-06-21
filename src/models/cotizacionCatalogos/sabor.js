const mongoose = require("mongoose");

/**
 * Sabor del bizcocho para la cotización personalizada de pastel.
 *
 * El cliente NO compra directo: elige un sabor en /cotizacion y el admin
 * arma el pastel. Por eso este catálogo guarda metadatos visuales
 * (swatch / emoji) y un vínculo opcional a una Receta para auto-costeo.
 *
 * - Si `recetaId` está presente, el admin puede recostear y obtener
 *   un snapshot del costo unitario (receta.total_cost / receta.portions).
 * - Si no, `costoManualPorPorcion` se usa como fallback.
 *
 * En la maqueta esto pinta como un `.opt` con un `.csw` (color swatch)
 * a la izquierda y el nombre + descripción.
 */
const saborSchema = new mongoose.Schema(
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

    // Visual — para pintar en el front sin assets externos
    swatch: { type: String, default: "linear-gradient(135deg,#FFE2E7,#FFC3C9)" },
    emoji:  { type: String, default: "" },

    // ── Costeo ──────────────────────────────────────────────
    // Preferido: vincular a una Receta. El admin recostea cuando quiera
    // y se guarda el snapshot. NO se cobra al cliente — solo se usa en
    // la vista interna de la cotización para sugerir precio.
    recetaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Receta",
      default: null,
    },
    costoUnitarioSnapshot: { type: Number, default: null, min: 0 },
    fechaCosteoSnapshot:   { type: Date, default: null },

    // Fallback: si no hay receta, costo manual por porción que el admin
    // dice "este pan me cuesta ~X por porción".
    costoManualPorPorcion: { type: Number, default: 0, min: 0 },

    // A qué productos aplica este sabor. La receta del bizcocho del pastel
    // y la del cupcake suelen diferir, por eso se elige por separado (un
    // sabor puede marcarse para ambos si la receta sirve igual).
    paraPastel:  { type: Boolean, default: true },
    paraCupcake: { type: Boolean, default: false },
    paraVintage: { type: Boolean, default: false },

    activo: { type: Boolean, default: true },
    orden:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SaborCotiza", saborSchema);
