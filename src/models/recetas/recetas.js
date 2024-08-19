const mongoose = require("mongoose");
const Ingrediente = require("./ingrediente"); // Importar el modelo de Ingrediente

const recetaSchema = new mongoose.Schema(
  {
    nombre_receta: {
      type: String,
      required: [true, "El nombre de la receta es obligatorio"],
    },
    descripcion: {
      type: String,
      required: [true, "La descripción es obligatoria"],
    },
    ingredientes: [Ingrediente.schema], // Array de ingredientes usando el schema del modelo
    profit_margin: {
      type: Number,
      required: [true, "El margen de ganancia es obligatorio"],
      match: [/^\d+(\.\d+)?$/, "Margen de ganancia no válido"], // Permite decimales
    },
    portions: {
      type: Number,
      required: [true, "El número de porciones es obligatorio"],
      match: [/^\d+$/, "Número de porciones no válido"],
    },
    fixed_costs_hours: {
      type: Number,
      required: [true, "Los gastos fijos en horas son obligatorios"],
      match: [/^\d+(\.\d+)?$/, "Gastos fijos en horas no válidos"], // Permite decimales
    },
    fixed_costs: {
      type: Number,
      required: [true, "Los gastos fijos son obligatorios"],
    },
    special_tax: {
      type: Number,
      required: [true, "El IEPS es obligatorio"],
    },
    additional_costs: {
      type: Number,
      required: [true, "Los costos adicionales son obligatorios"],
    },
    total_cost: {
      type: Number,
      required: [true, "El costo total es obligatorio"],
    },
  },
  {
    timestamps: true,
  }
);

const Receta = mongoose.model("Receta", recetaSchema);

module.exports = Receta;
