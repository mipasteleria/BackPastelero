const mongoose = require("mongoose");

// Schema embebido en cada cotización — congela todos los valores al momento
// del costeo para que futuras ediciones de recetas/técnicas no lo alteren.
const costeoSnapshotSchema = new mongoose.Schema(
  {
    fechaCosteo: { type: Date, default: Date.now },
    porciones: { type: Number, required: true },

    // Receta base
    recetaId: { type: mongoose.Schema.Types.ObjectId },
    recetaNombre: { type: String },
    recetaRendimiento: { type: Number },   // receta.portions (porciones por lote)
    recetasNecesarias: { type: Number },   // Math.ceil(porciones / recetaRendimiento)
    costoReceta: { type: Number },         // receta.total_cost * recetasNecesarias

    // Técnicas creativas aplicadas (valores congelados)
    tecnicas: [
      {
        tecnicaId: { type: mongoose.Schema.Types.ObjectId },
        nombre: { type: String },
        costoBase: { type: Number },
        escalaPorPorcion: { type: Number },
        tiempoHoras: { type: Number },
        costoCalculado: { type: Number },
      },
    ],

    // Tarifas operativas al momento del costeo (snapshot de Costs)
    tarifaHoraSnapshot: { type: Number },
    costoFijoSnapshot: { type: Number },

    // Totales calculados
    costoTecnicasTotal: { type: Number },
    costoTotal: { type: Number },

    // IVA
    ivaPercent: { type: Number, default: 16 },
    ivaImporte: { type: Number },

    // Precio sugerido y ganancia
    margenDeseado: { type: Number },   // % markup sobre costo total
    precioSugerido: { type: Number },  // costoTotal * (1 + margenDeseado/100), sin IVA
    precioFinal: { type: Number },     // precioSugerido + ivaImporte
    gananciaNeta: { type: Number },    // precioSugerido - costoTotal
  },
  { _id: false }
);

module.exports = costeoSnapshotSchema;
