const Cost = require("../models/costs");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Costo total de una receta, calculado EN EL SERVIDOR.
 *
 * Por qué existe: antes el navegador calculaba `total_cost` y el backend
 * lo guardaba tal cual. Eso dejaba la cifra a merced del estado del
 * cliente — si las tarifas por hora no habían cargado (o estaban en 0 en
 * la configuración), el navegador mandaba un costo sin mano de obra ni
 * gastos fijos y el servidor lo aceptaba sin notarlo.
 *
 * Pasó de verdad: 27 recetas quedaron guardadas con solo el costo de
 * ingredientes, subvaluadas 2.2 veces en promedio y hasta 9 veces en el
 * peor caso. Proteger la pantalla no bastó, porque el problema estaba en
 * que el cliente era la fuente de la verdad.
 *
 * Fórmula (la misma que mostraba el desglose del front):
 *   (ingredientes + adicionales) × (1 + IEPS%)
 *   + horas de mano de obra × tarifa de mano de obra
 *   + horas de taller       × tarifa de gastos fijos
 *   + sub-recetas
 *
 * @returns {{ total_cost, desglose, advertencias }}
 */
async function calcularCostoReceta(receta) {
  const cfg = await Cost.findOne();
  const tarifaLabor = num(cfg?.laborCosts);
  const tarifaFija = num(cfg?.fixedCosts);

  const materiales = (receta.ingredientes || []).reduce((a, i) => a + num(i.precio), 0);
  const subRecetas = (receta.subRecetas || []).reduce(
    (a, s) => a + num(s.costoUnitarioSnapshot) * num(s.cantidad), 0
  );
  const adicionales = num(receta.additional_costs);
  const iepsPct = num(receta.special_tax);

  const horasLabor = num(receta.hours_labor);
  const horasFijas = num(receta.hours_fixed);

  const subBruto = materiales + adicionales;
  const ieps = (subBruto * iepsPct) / 100;
  const manoObra = horasLabor * tarifaLabor;
  const gastosFijos = horasFijas * tarifaFija;

  const total = subBruto + ieps + manoObra + gastosFijos + subRecetas;

  // Avisos para que un costo sospechoso no pase desapercibido. No
  // bloquean el guardado —puede haber recetas legítimamente sin horas—
  // pero quedan en la respuesta y en el log.
  const advertencias = [];
  if ((horasLabor > 0 || horasFijas > 0) && tarifaLabor === 0 && tarifaFija === 0) {
    advertencias.push(
      "La receta declara horas de trabajo pero las tarifas por hora están en $0, " +
      "así que su costo no incluye mano de obra ni gastos fijos. " +
      "Revisa Gastos Fijos y Mano de Obra."
    );
  }

  return {
    total_cost: round2(total),
    desglose: {
      materiales: round2(materiales),
      adicionales: round2(adicionales),
      ieps: round2(ieps),
      manoObra: round2(manoObra),
      gastosFijos: round2(gastosFijos),
      subRecetas: round2(subRecetas),
      tarifaLabor,
      tarifaFija,
    },
    advertencias,
  };
}

module.exports = { calcularCostoReceta, round2 };
