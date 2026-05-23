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

  // ── Postres: configuración global ──────────────────────────────
  // Branding por postre — análogo al de galletas pero separado por si
  // el costo varía (ej. etiqueta más grande, sticker premium). El
  // empaque NO va aquí porque varía por postre (domo, caja, etc.).
  costoBrandingPorPostre: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Markup default para postres cuando la receta no tiene profit_margin
  // o el admin no lo override en el form de postre.
  markupPostresPct: {
    type: Number,
    default: 60,
    min: 0,
  },
});

module.exports = mongoose.model("Cost", costSchema);
