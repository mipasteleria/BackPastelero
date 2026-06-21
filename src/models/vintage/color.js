const mongoose = require("mongoose");

/**
 * Color base del pastel vintage. El admin sube un PNG sin fondo del pastel
 * en ese color para el visualizador. Puede tener costo+margen (default 0).
 */
const colorSchema = new mongoose.Schema(
  {
    slug:   { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^[a-z0-9-]+$/, "Slug inválido"] },
    nombre: { type: String, required: true, trim: true },
    hex:    { type: String, default: "#FFFFFF" },
    imagenUrl: { type: String, default: "" }, // PNG sin fondo (capa base)
    costo:  { type: Number, default: 0, min: 0 },
    margen: { type: Number, default: 0, min: 0 },
    activo: { type: Boolean, default: true },
    orden:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VintageColor", colorSchema);
