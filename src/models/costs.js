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

  // ── Pasarela de pago: comisión incorporada al precio ───────────
  // Cuando `incluirEnPrecio` está prendido, los precios sugeridos de
  // todos los productos se calculan con "gross-up" para que la comisión
  // de la pasarela no se coma el margen. Ver src/utils/comisionPasarela.js
  // — sumar el porcentaje a secas NO recupera la comisión.
  //
  // Es configurable (y no hardcodeado a Stripe) porque las tarifas
  // cambian y porque la idea es poder migrar a Mercado Pago sin tocar
  // código: basta cambiar proveedor y tarifas aquí.
  pasarela: {
    proveedor: {
      type: String,
      enum: ["stripe", "mercadopago", "otro"],
      default: "stripe",
    },
    // Porcentaje por transacción. Stripe MX ~3.6%, Mercado Pago varía
    // según el plazo de liberación del dinero.
    comisionPct: { type: Number, default: 0, min: 0 },
    // Cuota fija por transacción (Stripe MX cobra $3 MXN además del %).
    comisionFija: { type: Number, default: 0, min: 0 },
    // En México la comisión causa IVA, así que la tarifa real es la
    // publicada × 1.16. Configurable por si cambia o no aplica.
    ivaSobreComisionPct: { type: Number, default: 16, min: 0 },
    // El interruptor que pidió el usuario: apagado, nada cambia.
    incluirEnPrecio: { type: Boolean, default: false },
  },
});

module.exports = mongoose.model("Cost", costSchema);
