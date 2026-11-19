const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Costo y precio por porción de un postre del catálogo de mesa de postres.
 *
 * Vive aparte porque lo usan dos lugares y tienen que coincidir sí o sí:
 * el costeo de la cotización (lo que realmente se cobra) y la pantalla de
 * catálogo del dashboard (lo que el admin ve al dar de alta el postre).
 * Cuando esa lógica estaba duplicada, la pantalla mostraba solo el costo
 * y parecía que el margen no se estaba aplicando, aunque al cotizar sí se
 * aplicaba — confusión que costó un rato entender.
 *
 * Prioridad del margen, igual que en el resto del sistema: el de la
 * receta si lo tiene, y si no el markup global.
 *
 * @param {Object} postre  doc de PostreCotiza, con `recetaId` poblado
 * @param {number} markupGlobal  porcentaje por defecto
 */
function costearPostreMesa(postre, markupGlobal) {
  const receta = postre?.recetaId;
  const tieneReceta = Boolean(receta && receta.portions > 0);

  let unitario;
  let margenPct;
  let fuente;

  if (tieneReceta) {
    unitario = receta.total_cost / receta.portions;
    margenPct = receta.profit_margin ?? markupGlobal;
    fuente = "receta";
  } else {
    // Sin receta: el costo congelado del último recosteo, o el manual.
    unitario = postre?.costoUnitarioSnapshot ?? postre?.costoManual ?? 0;
    margenPct = markupGlobal;
    fuente = "manual";
  }

  const costoUnitario = round2(unitario);
  const precioUnitario = round2(unitario * (1 + (Number(margenPct) || 0) / 100));

  return {
    // Sin redondear: el costeo de la cotización multiplica esto por el
    // número de piezas y redondea al final. Redondear antes de multiplicar
    // desplaza centavos cuando el costo por porción tiene decimales
    // periódicos (ej. una receta que rinde 3 o 7 porciones).
    costoUnitarioExacto: unitario,
    costoUnitario,
    margenPct: Number(margenPct) || 0,
    precioUnitario,
    gananciaUnitaria: round2(precioUnitario - costoUnitario),
    fuente,
    // De dónde salió el margen, para poder explicarlo en pantalla.
    margenFuente: tieneReceta && receta.profit_margin != null ? "receta" : "global",
    recetaNombre: receta?.nombre_receta?.trim() || null,
    recetaPorciones: tieneReceta ? receta.portions : null,
  };
}

module.exports = { costearPostreMesa, round2 };
