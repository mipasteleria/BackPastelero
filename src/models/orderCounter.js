const mongoose = require("mongoose");

/**
 * Contador global atómico para números de orden.
 *
 * Usamos un único documento (`_id: "global"`) que se incrementa con
 * findOneAndUpdate + $inc — atomic en MongoDB, así que dos pedidos creados
 * en paralelo nunca obtienen el mismo número.
 *
 * El consecutivo NUNCA se reinicia. Da unicidad absoluta a través de todos
 * los productos (galletas, pasteles, cupcakes, snacks, vintage).
 */
const orderCounterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // "global"
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("orderCounter", orderCounterSchema);
