const mongoose = require("mongoose");

/**
 * Tamaño (porciones) del pastel vintage. Define:
 *  - pisosMax: cuántos pisos se permiten para ese tamaño (1, 2, 3).
 *  - anticipacionDias: días hábiles mínimos para pedirlo.
 *  - base / domo / branding: costos siempre incluidos, cada uno con su
 *    propio margen (ganancia visible para el admin).
 */
const porcionSchema = new mongoose.Schema(
  {
    slug:    { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^[a-z0-9-]+$/, "Slug inválido"] },
    nombre:  { type: String, required: true, trim: true },     // "12 porciones"
    porciones: { type: Number, required: true, min: 1 },
    pisosMax: { type: Number, default: 1, min: 1, max: 3 },
    anticipacionDias: { type: Number, default: 5, min: 0 },

    costoBase:     { type: Number, default: 0, min: 0 },
    margenBase:    { type: Number, default: 0, min: 0 },
    costoDomo:     { type: Number, default: 0, min: 0 },
    margenDomo:    { type: Number, default: 0, min: 0 },
    costoBranding: { type: Number, default: 0, min: 0 },
    margenBranding:{ type: Number, default: 0, min: 0 },

    activo: { type: Boolean, default: true },
    orden:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VintagePorcion", porcionSchema);
