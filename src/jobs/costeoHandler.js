const Receta = require("../models/recetas/recetas");
const TecnicaCreativa = require("../models/tecnicaCreativa");
const Cost = require("../models/costs");

/**
 * Calcula y guarda el costeoSnapshot en una cotización.
 *
 * @param {Object} cotizacion  - documento Mongoose de la cotización
 * @param {number} porciones   - número de porciones pedidas
 * @param {Object} body        - { recetaId, tecnicaIds[], margenDeseado, ivaPercent? }
 * @returns {Object}           - el snapshot calculado
 */
async function calcularCosteo(cotizacion, porciones, body) {
  const { recetaId, tecnicaIds = [], margenDeseado = 0, ivaPercent = 16 } = body;

  if (!recetaId) throw new Error("recetaId es obligatorio");
  if (porciones <= 0) throw new Error("Las porciones deben ser > 0");

  const [receta, tecnicas, costs] = await Promise.all([
    Receta.findById(recetaId).lean(),
    TecnicaCreativa.find({ _id: { $in: tecnicaIds }, activo: true }).lean(),
    Cost.findOne().lean(),
  ]);

  if (!receta) throw new Error("Receta no encontrada");

  const tarifaHora = costs?.laborCosts ?? 0;
  const costoFijo = costs?.fixedCosts ?? 0;

  const recetaRendimiento = receta.portions;
  const recetasNecesarias = Math.ceil(porciones / recetaRendimiento);
  const costoReceta = receta.total_cost * recetasNecesarias;

  const tecnicasSnapshot = tecnicas.map((t) => {
    const costoCalculado =
      t.costoBase + t.escalaPorPorcion * porciones + t.tiempoHoras * tarifaHora;
    return {
      tecnicaId: t._id,
      nombre: t.nombre,
      costoBase: t.costoBase,
      escalaPorPorcion: t.escalaPorPorcion,
      tiempoHoras: t.tiempoHoras,
      costoCalculado: round2(costoCalculado),
    };
  });

  const costoTecnicasTotal = round2(
    tecnicasSnapshot.reduce((s, t) => s + t.costoCalculado, 0)
  );

  const costoTotal = round2(costoReceta + costoTecnicasTotal + costoFijo);

  const precioSugerido = round2(costoTotal * (1 + margenDeseado / 100));
  const ivaImporte = round2(precioSugerido * (ivaPercent / 100));
  const precioFinal = round2(precioSugerido + ivaImporte);
  const gananciaNeta = round2(precioSugerido - costoTotal);

  const snapshot = {
    fechaCosteo: new Date(),
    porciones,
    recetaId: receta._id,
    recetaNombre: receta.nombre_receta,
    recetaRendimiento,
    recetasNecesarias,
    costoReceta: round2(costoReceta),
    tecnicas: tecnicasSnapshot,
    tarifaHoraSnapshot: tarifaHora,
    costoFijoSnapshot: costoFijo,
    costoTecnicasTotal,
    costoTotal,
    ivaPercent,
    ivaImporte,
    margenDeseado,
    precioSugerido,
    precioFinal,
    gananciaNeta,
  };

  cotizacion.costeoSnapshot = snapshot;
  await cotizacion.save();

  return snapshot;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { calcularCosteo };
