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

    // ── Snapshots de tarifas globales al momento de guardar la receta ──
    // (legacy: el nombre `fixed_costs_hours` confunde — guardaba la
    // tarifa horaria de mano de obra, no horas. Se mantiene por compat
    // con recetas existentes; el cálculo real usa los nuevos campos
    // `hours_labor` y `hours_fixed` cuando están definidos.)
    fixed_costs_hours: {
      type: Number,
      required: false, // legacy: era requerido cuando guardaba la tarifa
    },
    fixed_costs: {
      type: Number,
      required: false, // legacy: ver comentario arriba
    },

    // ── Nuevos campos para costeo correcto ──
    // Horas de mano de obra usadas en la receta. Se multiplican por
    // la tarifa horaria (`Cost.laborCosts`) para obtener el costo de
    // mano de obra real de la receta.
    hours_labor: {
      type: Number,
      default: 0,
      min: [0, "Las horas no pueden ser negativas"],
    },
    // Horas de uso del taller (gastos fijos). Multiplican por
    // `Cost.fixedCosts` (tarifa horaria) para obtener los fijos.
    hours_fixed: {
      type: Number,
      default: 0,
      min: [0, "Las horas no pueden ser negativas"],
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
      match: [/^\d+(\.\d+)?$/, "Costo total no válido"],
    },
  },
  {
    timestamps: true,
  }
);

const Receta = mongoose.model("Receta", recetaSchema);

module.exports = Receta;
