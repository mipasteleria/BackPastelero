const mongoose = require("mongoose");

const costSchema = new mongoose.Schema({
  fixedCosts: {
    type: Number,
    required: true,
  },
  laborCosts: {
    type: Number,
    required: true,
  },

  // ── Galletas NY: configuración global ──────────────────────────
  // Se inyectan en el cálculo de precio sugerido al dar de alta un sabor.
  // Defaults pensados para que el sistema funcione aunque el admin no
  // haya configurado nada todavía: costo cero, markup 60%, margen mínimo
  // de $5 por galleta antes de levantar alerta de margen bajo.
  costoBrandingPorGalleta: {
    type: Number,
    default: 0,
    min: 0,
  },
  markupGalletasPct: {
    type: Number,
    default: 60,
    min: 0,
  },
  margenMinimoGalleta: {
    type: Number,
    default: 5,
    min: 0,
  },
});

module.exports = mongoose.model("Cost", costSchema);
