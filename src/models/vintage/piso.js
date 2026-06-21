const mongoose = require("mongoose");

/**
 * Costo extra por número de pisos del pastel vintage. 1 piso normalmente
 * cuesta 0 (incluido en base). 2 y 3 pisos suman costo+margen.
 */
const pisoSchema = new mongoose.Schema(
  {
    slug:    { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^[a-z0-9-]+$/, "Slug inválido"] },
    nombre:  { type: String, required: true, trim: true },   // "2 pisos"
    niveles: { type: Number, required: true, min: 1, max: 3 },
    costo:   { type: Number, default: 0, min: 0 },
    margen:  { type: Number, default: 0, min: 0 },
    activo:  { type: Boolean, default: true },
    orden:   { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VintagePiso", pisoSchema);
