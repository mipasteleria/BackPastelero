const Receta = require("../models/recetas/recetas");
const TecnicaCreativa = require("../models/tecnicaCreativa");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Reparte los costos de un mes entre materia prima, mano de obra y
 * gastos fijos.
 *
 * El dashboard mostraba un solo número de "costos" sin decir en qué se
 * iba. Aquí se abre, rastreando cada renglón del costeo guardado hasta su
 * origen:
 *
 *   - Renglones que vienen de una RECETA se reparten en la misma
 *     proporción que tiene esa receta por dentro (ingredientes vs horas
 *     de trabajo vs horas de taller).
 *   - Renglones que vienen de una TÉCNICA creativa: las horas son mano de
 *     obra, el costo base es materia prima.
 *   - Renglones de INSUMO (empaque, base, domo) son materia prima.
 *   - Lo capturado a mano no se puede atribuir, así que se reporta como
 *     "sin clasificar" en vez de adivinar.
 *
 * Se devuelve siempre la cobertura: qué parte del costo se pudo explicar.
 * Un desglose sin ese dato invita a leer como "no gasto en X" lo que en
 * realidad es "no sé de dónde viene esto".
 */

const vacio = () => ({ materiaPrima: 0, manoObra: 0, gastosFijos: 0, otros: 0, sinClasificar: 0 });

/**
 * Proporción interna de una receta. Las partes se normalizan para que
 * sumen exactamente su `total_cost`: el costo guardado es la verdad, y
 * las tarifas de hoy pueden no ser las de cuando se guardó.
 */
function proporcionReceta(receta, tarifas) {
  const mp = (receta.ingredientes || []).reduce((a, i) => a + num(i.precio), 0)
           + (receta.subRecetas || []).reduce((a, s) => a + num(s.costoUnitarioSnapshot) * num(s.cantidad), 0);
  const mo = num(receta.hours_labor) * num(tarifas.laborCosts);
  const gf = num(receta.hours_fixed) * num(tarifas.fixedCosts);
  const otros = num(receta.additional_costs) + (mp + num(receta.additional_costs)) * num(receta.special_tax) / 100;

  const suma = mp + mo + gf + otros;
  const total = num(receta.total_cost);
  if (suma <= 0 || total <= 0) return { mp: 0, mo: 0, gf: 0, otros: 1 };

  // Normalizado: cada parte como fracción del total guardado.
  const k = total / suma;
  return {
    mp: (mp * k) / total,
    mo: (mo * k) / total,
    gf: (gf * k) / total,
    otros: (otros * k) / total,
  };
}

/** Suma `monto` al acumulador, repartido según la proporción de la receta. */
function sumarPorReceta(acc, monto, receta, tarifas) {
  if (!receta) { acc.sinClasificar += monto; return; }
  const p = proporcionReceta(receta, tarifas);
  acc.materiaPrima += monto * p.mp;
  acc.manoObra     += monto * p.mo;
  acc.gastosFijos  += monto * p.gf;
  acc.otros        += monto * p.otros;
}

/** Técnica creativa: las horas son mano de obra, lo demás materia prima. */
function sumarPorTecnica(acc, monto, tecnica, tarifaHora) {
  if (!tecnica) { acc.sinClasificar += monto; return; }
  const mo = Math.min(monto, num(tecnica.tiempoHoras) * num(tarifaHora));
  acc.manoObra += mo;
  acc.materiaPrima += monto - mo;
}

/**
 * Desglosa los costos de un conjunto de cotizaciones y pedidos vintage.
 *
 * @param {Array} cotizaciones  docs con costeoSnapshot
 * @param {Array} vintage       docs de pedido vintage
 * @param {Object} tarifas      { laborCosts, fixedCosts }
 */
async function desglosarCostos(cotizaciones, vintage, tarifas) {
  const acc = vacio();

  // Una sola consulta para todas las recetas y técnicas referenciadas.
  const [recetas, tecnicas] = await Promise.all([
    Receta.find().select("nombre_receta total_cost ingredientes subRecetas hours_labor hours_fixed additional_costs special_tax").lean(),
    TecnicaCreativa.find().select("nombre tiempoHoras costoBase").lean(),
  ]);
  const porReceta = new Map(recetas.map((r) => [String(r._id), r]));
  const porTecnica = new Map(tecnicas.map((t) => [String(t._id), t]));
  const buscarRecetaPorNombre = (n) =>
    n ? recetas.find((r) => r.nombre_receta.trim() === String(n).trim()) : null;

  for (const cot of cotizaciones) {
    const s = cot.costeoSnapshot;
    if (!s || !num(s.costoTotal)) continue;
    const tarifaHora = num(s.tarifaHora) || num(tarifas.laborCosts);

    const porRef = (det) =>
      (det?.recetaId && porReceta.get(String(det.recetaId))) || buscarRecetaPorNombre(det?.recetaNombre);

    // Mesa de postres: cada postre trae su receta.
    if (Array.isArray(s.postres) && s.postres.length) {
      for (const p of s.postres) sumarPorReceta(acc, num(p.costo), porRef(p), tarifas);
    }

    // Bizcocho: puede venir por sabor (cupcakes) o como uno solo.
    if (Array.isArray(s.bizcocho?.porSabor) && s.bizcocho.porSabor.length) {
      for (const b of s.bizcocho.porSabor) sumarPorReceta(acc, num(b.costo), porRef(b), tarifas);
    } else if (num(s.costoBizcocho)) {
      sumarPorReceta(acc, num(s.costoBizcocho), porRef(s.bizcocho), tarifas);
    }

    if (num(s.costoRelleno))   sumarPorReceta(acc, num(s.costoRelleno), porRef(s.relleno), tarifas);
    if (num(s.costoCobertura)) sumarPorReceta(acc, num(s.costoCobertura), porRef(s.cobertura), tarifas);

    for (const d of s.decoraciones || []) {
      const monto = num(d.costo);
      if (!monto) continue;
      if (d.fuente === "tecnica" && d.tecnicaId) {
        sumarPorTecnica(acc, monto, porTecnica.get(String(d.tecnicaId)), tarifaHora);
      } else {
        acc.sinClasificar += monto; // decoración con costo manual
      }
    }

    for (const e of s.extras || []) {
      const monto = num(e.subtotal);
      if (!monto) continue;
      if (e.tipo === "insumo") acc.materiaPrima += monto;
      else if (e.tipo === "receta") sumarPorReceta(acc, monto, buscarRecetaPorNombre(e.concepto), tarifas);
      else if (e.tipo === "tecnica") acc.manoObra += monto;
      else acc.sinClasificar += monto;
    }
  }

  // Vintage: el pedido guarda el costo por concepto, pero no de dónde sale
  // cada uno (insumo o receta), así que no se puede atribuir sin adivinar.
  for (const p of vintage) acc.sinClasificar += num(p.totalCosto);

  const clasificado = acc.materiaPrima + acc.manoObra + acc.gastosFijos + acc.otros;
  const total = clasificado + acc.sinClasificar;

  return {
    materiaPrima: round2(acc.materiaPrima),
    manoObra: round2(acc.manoObra),
    gastosFijos: round2(acc.gastosFijos),
    otros: round2(acc.otros),
    sinClasificar: round2(acc.sinClasificar),
    total: round2(total),
    coberturaPct: total > 0 ? Math.round((clasificado / total) * 100) : 0,
  };
}

module.exports = { desglosarCostos };
