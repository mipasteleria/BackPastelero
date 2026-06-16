const mongoose = require("mongoose");

/**
 * Cobertura del pastel (buttercream, ganache, fondant, etc.).
 *
 * Similar a relleno: el admin puede teclear el costo manual por porción
 * o vincular una Receta para auto-costear (botón recostear). La bandera
 * `esFondant` permite al front pintar el toggle especial de la maqueta
 * (fondant suele tener costo extra significativo). El campo
 * `costoExtraSiFondant` no se usa hoy — `costoPorPorcion` ya incluye el
 * costo total para esa cobertura.
 */
const coberturaSchema = new mongoose.Schema(
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

    // Fallback: costo manual por porción del pastel.
    costoPorPorcion: { type: Number, default: 0, min: 0 },

    // Marca esta cobertura como "fondant" para que el front pueda
    // mostrar el toggle/pictograma especial de la maqueta.
    esFondant: { type: Boolean, default: false },

    activo: { type: Boolean, default: true },
    orden:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CoberturaCotiza", coberturaSchema);
