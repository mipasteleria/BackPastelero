const mongoose = require("mongoose");

/**
 * Fecha bloqueada por el admin (agenda llena, vacaciones, festivo…).
 * Se guarda como "YYYY-MM-DD". Los formularios de cotización, vintage,
 * galletas, postres y carrito rechazan estas fechas.
 */
const fechaBloqueadaSchema = new mongoose.Schema(
  {
    fecha:  { type: String, required: true, unique: true, match: [/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"] },
    motivo: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FechaBloqueada", fechaBloqueadaSchema);
