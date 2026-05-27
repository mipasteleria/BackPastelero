const mongoose = require("mongoose");

/**
 * Sabor del relleno para la cotización personalizada de pastel.
 *
 * Catálogo simple: el admin teclea el nombre y el costo extra por
 * porción manualmente. NO se vincula a recetas porque los rellenos
 * comunes (ganache, mermelada, dulce de leche) son mezclas pequeñas
 * que no justifican una receta formal — el costo es estimado.
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

    // Costo manual por porción — el admin lo ajusta a mano.
    costoPorPorcion: { type: Number, default: 0, min: 0 },

    activo: { type: Boolean, default: true },
    orden:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RellenoCotiza", rellenoSchema);
