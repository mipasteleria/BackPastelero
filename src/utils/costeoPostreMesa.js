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
function costearPostreMesa(postre, markupGlobal, costoEmpaque = 0, comisionPct = 0) {
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

  // El empaque (contenedor, etiqueta) es costo del producto igual que los
  // ingredientes: entra ANTES del margen, no se descuenta de la ganancia.
  const empaque = Number(costoEmpaque) || 0;
  unitario += empaque;

  const costoUnitario = round2(unitario);

  // Precio: el fijado a mano si existe, si no el costo con su margen.
  // Cuando se fija a mano, el margen deja de ser un dato de entrada y
  // pasa a ser el resultado: lo interesante es cuánto deja de verdad.
  const precioFijado = Number(postre?.precioManual);
  const hayPrecioManual = Number.isFinite(precioFijado) && precioFijado > 0;

  const precioUnitario = hayPrecioManual
    ? round2(precioFijado)
    : round2(unitario * (1 + (Number(margenPct) || 0) / 100));

  // Con precio fijado, ese precio es el FINAL que paga el cliente, así
  // que la comisión de la pasarela sale de la ganancia. Cuando el precio
  // lo calcula el margen es al revés: se cobra de más para que la
  // comisión no se coma el margen (ver comisionPasarela.js).
  const pct = hayPrecioManual ? Math.max(0, Number(comisionPct) || 0) : 0;
  const comisionUnitaria = round2(precioUnitario * pct);

  if (hayPrecioManual) {
    margenPct = costoUnitario > 0
      ? Math.round(((precioUnitario - comisionUnitaria - costoUnitario) / costoUnitario) * 100)
      : 0;
  }

  return {
    // Sin redondear: el costeo de la cotización multiplica esto por el
    // número de piezas y redondea al final. Redondear antes de multiplicar
    // desplaza centavos cuando el costo por porción tiene decimales
    // periódicos (ej. una receta que rinde 3 o 7 porciones).
    costoUnitarioExacto: unitario,
    costoUnitario,
    costoEmpaque: round2(empaque),
    costoReceta: round2(unitario - empaque),
    margenPct: Number(margenPct) || 0,
    precioUnitario,
    // Neta: precio menos costo menos lo que se lleva la pasarela.
    gananciaUnitaria: round2(precioUnitario - comisionUnitaria - costoUnitario),
    comisionUnitaria,
    fuente,
    // De dónde salió el precio y el margen, para explicarlo en pantalla.
    precioFuente: hayPrecioManual ? "manual" : "margen",
    margenFuente: hayPrecioManual
      ? "calculado"
      : (tieneReceta && receta.profit_margin != null ? "receta" : "global"),
    recetaNombre: receta?.nombre_receta?.trim() || null,
    recetaPorciones: tieneReceta ? receta.portions : null,
  };
}

module.exports = { costearPostreMesa, round2 };
