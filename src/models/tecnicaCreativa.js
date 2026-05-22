const mongoose = require("mongoose");

const tecnicaCreativaSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: [true, "El nombre de la técnica es obligatorio"],
      trim: true,
    },
    categoria: {
      type: String,
      required: [true, "La categoría es obligatoria"],
      enum: ["decoracion", "relleno", "cobertura", "modelado", "flores", "impresion", "otro"],
    },
    costoBase: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    tiempoHoras: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    escalaPorPorcion: {
      type: Number,
      default: 0,
      min: 0,
    },
    descripcion: {
      type: String,
      trim: true,
    },
    activo: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TecnicaCreativa", tecnicaCreativaSchema);
