const mongoose = require("mongoose");

/**
 * Insumo / materia prima.
 *
 * El `name` y `unit` antes tenían un regex `/^[A-Za-z]+$/` que rechazaba
 * cualquier nombre con espacios, acentos, números o porcentajes — eso
 * bloqueaba ingredientes legítimos como "Nuez de Macadamia", "Plátano",
 * "Chocolate 70%" o "Harina 000". El regex está fuera; en su lugar
 * limitamos por longitud y dejamos pasar nombres naturales.
 *
 * `amount` y `cost` son Number, así que el `match: [regex]` anterior era
 * código muerto (Mongoose solo evalúa regex en Strings). Se reemplaza
 * por `min: 0` que sí valida.
 */
const insumosSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "El nombre es obligatorio"],
      trim: true,
      minlength: [1, "El nombre no puede estar vacío"],
      maxlength: [100, "El nombre es demasiado largo (máx 100 caracteres)"],
    },
    amount: {
      type: Number,
      required: [true, "La cantidad es obligatoria"],
      min: [0, "La cantidad no puede ser negativa"],
    },
    cost: {
      type: Number,
      required: [true, "El costo es obligatorio"],
      min: [0, "El costo no puede ser negativo"],
    },
    unit: {
      type: String,
      required: [true, "La unidad es obligatoria"],
      trim: true,
      minlength: [1, "La unidad no puede estar vacía"],
      maxlength: [20, "La unidad es demasiado larga (máx 20 caracteres)"],
    },
  },
  {
    timestamps: true,
  }
);

const Insumos = mongoose.model("insumos", insumosSchema);

module.exports = Insumos;
