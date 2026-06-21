const mongoose = require("mongoose");

/**
 * Decoración del pastel vintage (rosetones, conchas, olanes, drip…).
 * Multi-select: el cliente puede elegir varias y, para cada una, un color.
 * Cada color es una variante con su propio PNG sin fondo (capa del
 * visualizador). Costo+margen por decoración.
 */
const varianteColorSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true }, // "Azul"
    hex:    { type: String, default: "#FFFFFF" },
    imagenUrl: { type: String, default: "" },             // PNG sin fondo de esa variante
  },
  { _id: false }
);

const decoracionSchema = new mongoose.Schema(
  {
    slug:   { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^[a-z0-9-]+$/, "Slug inválido"] },
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, default: "" },
    costo:  { type: Number, default: 0, min: 0 },
    margen: { type: Number, default: 0, min: 0 },
    colores: { type: [varianteColorSchema], default: [] },
    activo: { type: Boolean, default: true },
    orden:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VintageDecoracion", decoracionSchema);
