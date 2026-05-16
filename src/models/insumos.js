const mongoose = require("mongoose");
const { normalizeName } = require("../utils/normalizeName");

/**
 * Insumo / materia prima.
 *
 * El `name` antes tenía un regex `/^[A-Za-z]+$/` que rechazaba espacios,
 * acentos, números y porcentajes. Se quitó y se validan por longitud.
 *
 * Para detección de duplicados se mantiene un campo derivado
 * `nameNormalized` (trim + lowercase + sin acentos + colapsar espacios)
 * que se recalcula automáticamente cuando cambia `name` mediante hooks
 * pre('save') y pre('findOneAndUpdate'). El índice NO es `unique` para
 * no romper si existen duplicados históricos — la validación de
 * duplicados se hace a nivel de aplicación en las rutas POST/PUT, que
 * además permiten devolver un mensaje claro con el id del existente.
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
    nameNormalized: {
      type: String,
      index: true,  // no unique — la validación se hace en la ruta
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

// Mantiene nameNormalized sincronizado con name en todos los flujos
// de escritura. Cubre tanto Mongoose.save() como findOneAndUpdate().
insumosSchema.pre("save", function (next) {
  if (this.isModified("name")) {
    this.nameNormalized = normalizeName(this.name);
  }
  next();
});

insumosSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};
  // Soporta tanto { name: "..." } como { $set: { name: "..." } }
  const newName = update.name ?? update.$set?.name;
  if (newName !== undefined) {
    const normalized = normalizeName(newName);
    if (update.$set) {
      update.$set.nameNormalized = normalized;
    } else {
      update.nameNormalized = normalized;
    }
    this.setUpdate(update);
  }
  next();
});

const Insumos = mongoose.model("insumos", insumosSchema);

module.exports = Insumos;
