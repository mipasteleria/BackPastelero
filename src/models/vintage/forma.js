const mongoose = require("mongoose");

/**
 * Forma del pastel vintage (corazón, círculo, cuadrado, hexágono).
 * No suma costo (solo estética/disponibilidad). Imagen opcional para el
 * selector.
 */
const formaSchema = new mongoose.Schema(
  {
    slug:   { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^[a-z0-9-]+$/, "Slug inválido"] },
    nombre: { type: String, required: true, trim: true },
    emoji:  { type: String, default: "" },
    imagenUrl: { type: String, default: "" }, // PNG opcional para el visualizador
    activo: { type: Boolean, default: true },
    orden:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VintageForma", formaSchema);
