const mongoose = require("mongoose");

/**
 * Renglón de empaque de un producto (bolsa, etiqueta, caja, listón…).
 *
 * Mismo patrón que las porciones de vintage: cada renglón puede ligarse a
 * un insumo (`insumoId`) para que el costo se lea en vivo de materia prima
 * y se actualice solo cuando sube el precio del proveedor, o capturarse a
 * mano (`costoManual`) cuando no vale la pena darlo de alta como insumo.
 *
 * `cantidad` permite cosas como "2 etiquetas por caja" o media bolsa.
 * El costo unitario de un insumo es `cost / amount` — es decir el precio
 * por unidad de la presentación en que se compra (ej. un paquete de 100
 * bolsas a $120 cuesta $1.20 la bolsa).
 */
const empaqueItemSchema = new mongoose.Schema(
  {
    concepto: { type: String, trim: true, default: "" },
    insumoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "insumos",
      default: null,
    },
    costoManual: { type: Number, default: 0, min: [0, "El costo no puede ser negativo"] },
    cantidad: { type: Number, default: 1, min: [0, "La cantidad no puede ser negativa"] },
  },
  { _id: false }
);

module.exports = empaqueItemSchema;
