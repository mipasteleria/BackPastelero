const Cost = require("../models/costs");

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Comisión de la pasarela de pago, incorporada al precio público.
 *
 * ⚠️ OJO CON LA MATEMÁTICA: sumar el porcentaje al precio NO recupera la
 * comisión, porque la pasarela cobra su porcentaje sobre el total que le
 * cobras — incluida la parte que agregaste para cubrirla.
 *
 *   Neto deseado $100, comisión 3.6%
 *   ✗ mal:  cobras $103.60 → te retienen $3.73 → recibes $99.87  (faltan $0.13)
 *   ✓ bien: cobras 100 / (1 − 0.036) = $103.73 → te retienen $3.73 → recibes $100
 *
 * Por eso se usa la fórmula de "gross-up":
 *
 *   bruto = (neto + comisiónFija) / (1 − pct)
 *
 * En México la comisión de la pasarela causa IVA, así que tanto el
 * porcentaje como la cuota fija se escalan por (1 + IVA) antes de
 * aplicar la fórmula. Todo es configurable porque Stripe y Mercado Pago
 * cobran distinto, y las tarifas cambian.
 *
 * Config en el documento global `Cost`, campo `pasarela`.
 */

const PROVEEDORES = {
  stripe: "Stripe",
  mercadopago: "Mercado Pago",
  otro: "Otra",
};

/**
 * Lee la config de pasarela. Si no está configurada o está apagada,
 * devuelve `activa: false` y los cálculos quedan en no-op.
 */
async function getConfigPasarela() {
  const cfg = await Cost.findOne();
  const p = cfg?.pasarela || {};
  const comisionPct = Number(p.comisionPct) || 0;
  const comisionFija = Number(p.comisionFija) || 0;
  return {
    proveedor: p.proveedor || "stripe",
    proveedorNombre: PROVEEDORES[p.proveedor] || PROVEEDORES.stripe,
    comisionPct,
    comisionFija,
    ivaSobreComisionPct: p.ivaSobreComisionPct != null ? Number(p.ivaSobreComisionPct) : 16,
    // Solo tiene efecto si el admin lo prendió Y hay alguna tarifa capturada.
    activa: Boolean(p.incluirEnPrecio) && (comisionPct > 0 || comisionFija > 0),
  };
}

/**
 * Aplica el gross-up a un precio neto deseado.
 *
 * @param {number} precioNeto lo que quieres que te quede después de comisión
 * @param {object} cfg config de `getConfigPasarela()`
 * @returns {{ precioFinal, comision, precioNeto, aplicada, detalle }}
 */
function aplicarComision(precioNeto, cfg) {
  const neto = Number(precioNeto) || 0;
  if (!cfg || !cfg.activa || neto <= 0) {
    return { precioFinal: round2(neto), comision: 0, precioNeto: round2(neto), aplicada: false, detalle: null };
  }

  const factorIva = 1 + (Number(cfg.ivaSobreComisionPct) || 0) / 100;
  const pct = ((Number(cfg.comisionPct) || 0) / 100) * factorIva;
  const fija = (Number(cfg.comisionFija) || 0) * factorIva;

  // Si alguien captura una comisión de 100% o más la fórmula se indefine
  // (dividir por cero o negativo): no aplicamos nada y lo reportamos.
  if (pct >= 1) {
    return {
      precioFinal: round2(neto),
      comision: 0,
      precioNeto: round2(neto),
      aplicada: false,
      detalle: { error: "La comisión configurada es de 100% o más; revisa la configuración de pasarela." },
    };
  }

  const bruto = (neto + fija) / (1 - pct);
  const precioFinal = round2(bruto);
  return {
    precioFinal,
    comision: round2(precioFinal - neto),
    precioNeto: round2(neto),
    aplicada: true,
    detalle: {
      proveedor: cfg.proveedor,
      proveedorNombre: cfg.proveedorNombre,
      comisionPct: cfg.comisionPct,
      comisionFija: cfg.comisionFija,
      ivaSobreComisionPct: cfg.ivaSobreComisionPct,
    },
  };
}

/** Atajo: lee la config y aplica en un solo paso. */
async function aplicarComisionAlPrecio(precioNeto) {
  const cfg = await getConfigPasarela();
  return aplicarComision(precioNeto, cfg);
}

module.exports = { PROVEEDORES, getConfigPasarela, aplicarComision, aplicarComisionAlPrecio };
