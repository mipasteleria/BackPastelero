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
    imagenUrl: { type: String, default: "" },             // PNG general (respaldo)
    // Igual que en colores base: la silueta de la decoración cambia según
    // forma y pisos; cada combinación puede tener su PNG. Sin variante se
    // usa imagenUrl.
    variantes: {
      type: [
        new mongoose.Schema(
          {
            formaSlug: { type: String, required: true, lowercase: true, trim: true },
            niveles:   { type: Number, required: true, min: 1, max: 3 },
            imagenUrl: { type: String, default: "" },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
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
