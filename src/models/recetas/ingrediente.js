const mongoose = require("mongoose");

const ingredienteSchema = new mongoose.Schema({
  ingrediente: {
    type: String,
    required: true,
  },
  cantidad: {
    type: Number,
    required: true,
  },
  precio: {
    type: Number,
    required: true,
  },
  unidad: {
    type: String,
    default: "gramos",
  },
  total: {
    type: Number,
    required: true,
  },
});

// Crear el modelo a partir del esquema
const Ingrediente = mongoose.model("Ingrediente", ingredienteSchema);

// Exportar el modelo
module.exports = Ingrediente;
