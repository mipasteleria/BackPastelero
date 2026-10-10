const Insumo = require("../models/insumos");

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Calcula el costo de empaque de un producto a partir de sus renglones.
 *
 * Cada renglón se cotiza en vivo: si tiene `insumoId` se lee el costo
 * unitario actual del insumo (`cost / amount`), si no se usa `costoManual`.
 * Así, cuando sube el precio de las bolsas en materia prima, el costeo de
 * todos los productos que las usan se actualiza sin tocar nada.
 *
 * Devuelve el total y el desglose por renglón, para poder mostrarle al
 * admin de dónde salió cada peso (y qué renglón quedó colgado si alguien
 * borró el insumo).
 *
 * @param {Array} items renglones con { concepto, insumoId, costoManual, cantidad }
 * @returns {Promise<{ total: number, detalle: Array }>}
 */
async function calcularEmpaque(items) {
  const lista = Array.isArray(items) ? items : [];
  if (lista.length === 0) return { total: 0, detalle: [] };

  // Una sola query para todos los insumos referenciados.
  const ids = [...new Set(lista.map((i) => i && i.insumoId).filter(Boolean).map(String))];
  const insumos = ids.length ? await Insumo.find({ _id: { $in: ids } }).select("name cost amount unit") : [];
  const porId = new Map(insumos.map((i) => [String(i._id), i]));

  const detalle = [];
  let total = 0;

  for (const item of lista) {
    const cantidad = Math.max(0, Number(item?.cantidad) || 0);
    const ins = item?.insumoId ? porId.get(String(item.insumoId)) : null;

    let unitario;
    let fuente;
    if (item?.insumoId && ins) {
      // cost/amount = precio por unidad de la presentación comprada.
      unitario = (Number(ins.cost) || 0) / (Number(ins.amount) || 1);
      fuente = "insumo";
    } else if (item?.insumoId && !ins) {
      // El insumo ligado ya no existe: caemos al manual pero lo marcamos
      // para que el admin vea que ese renglón quedó huérfano.
      unitario = Number(item?.costoManual) || 0;
      fuente = "insumo-faltante";
    } else {
      unitario = Number(item?.costoManual) || 0;
      fuente = "manual";
    }

    const subtotal = round2(unitario * cantidad);
    total += subtotal;
    detalle.push({
      concepto: item?.concepto || ins?.name || "Empaque",
      insumoId: item?.insumoId || null,
      insumoNombre: ins?.name || null,
      unitario: round2(unitario),
      cantidad,
      subtotal,
      fuente,
    });
  }

  return { total: round2(total), detalle };
}

module.exports = { calcularEmpaque };
