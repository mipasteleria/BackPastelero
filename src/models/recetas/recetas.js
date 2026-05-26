const mongoose = require("mongoose");
const Ingrediente = require("./ingrediente"); // Importar el modelo de Ingrediente

/**
 * Sub-receta: una receta que se usa como ingrediente intermedio de otra.
 *
 * Ej: la receta "Pan de naranja con maracuyá" usa 50g de la sub-receta
 * "Mermelada de maracuyá". El costo se calcula como:
 *     (mermelada.total_cost / mermelada.portions) × 50
 *
 * Guardamos snapshots (nombre, unidad, costo unitario) para que la
 * receta padre tenga la info al render sin tener que populate cada vez.
 * Si la sub-receta cambia DESPUÉS de guardarse en el padre, el padre
 * queda con info stale hasta que el admin lo re-guarde. Esto es honesto:
 * el admin sabe que si modifica una receta base, debe re-guardar las
 * recetas que dependen de ella.
 */
const subRecetaSchema = new mongoose.Schema(
  {
    recetaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Receta",
      required: true,
    },
    cantidad: {
      type: Number,
      required: true,
      min: [0, "Cantidad no puede ser negativa"],
    },
    // Snapshots al momento de guardar la receta padre.
    nombreSnapshot:        { type: String, default: "" },
    unidadSnapshot:        { type: String, default: "porcion" },
    costoUnitarioSnapshot: { type: Number, default: 0 }, // = total_cost / portions
  },
  { _id: false }
);

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

    // Recetas usadas como ingredientes intermedios (ej. mermelada dentro
    // de un postre compuesto). Cada item aporta:
    //   costoUnitarioSnapshot × cantidad
    // al total_cost calculado en el front.
    subRecetas: { type: [subRecetaSchema], default: [] },

    // Unidad del rendimiento. "porcion" para postres regulares (default
    // legacy); "gramos"/"ml" para preparaciones intermedias como
    // mermeladas o salsas; "pieza" para sub-recetas que rinden por unidad
    // (ej. "Galletas decoradas", rinde 12 piezas).
    unidadRendimiento: {
      type: String,
      enum: ["porcion", "gramos", "ml", "pieza"],
      default: "porcion",
    },

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
