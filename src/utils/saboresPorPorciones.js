/**
 * Cuántos sabores de bizcocho puede combinar un pastel según su tamaño.
 *
 *   menos de 20 porciones → 1 sabor
 *   de 20 a 49            → hasta 2
 *   50 o más              → 3 o más (sin tope: el pastel ya es grande
 *                           para dividirse en varias secciones)
 *
 * El front usa la misma regla para habilitar la selección múltiple y el
 * servidor la revalida al crear la cotización, porque el cliente puede
 * manipular el formulario.
 */

const MIN_DOS_SABORES  = 20;
const MIN_TRES_SABORES = 50;

/** Máximo de sabores permitido. Infinity significa "sin tope". */
function maxSabores(porciones) {
  const p = Number(porciones) || 0;
  if (p >= MIN_TRES_SABORES) return Infinity;
  if (p >= MIN_DOS_SABORES) return 2;
  return 1;
}

/** Texto de ayuda para el cliente, según cuántos puede elegir. */
function ayudaSabores(porciones) {
  const max = maxSabores(porciones);
  if (max === Infinity) return "Con este tamaño puedes combinar 3 o más sabores.";
  if (max === 2) return "Con este tamaño puedes combinar hasta 2 sabores.";
  return `A partir de ${MIN_DOS_SABORES} porciones puedes combinar 2 sabores, y desde ${MIN_TRES_SABORES} tres o más.`;
}

/** Recorta una lista de slugs al máximo permitido para ese tamaño. */
function recortarSabores(slugs, porciones) {
  const lista = (Array.isArray(slugs) ? slugs : []).filter(Boolean);
  const max = maxSabores(porciones);
  return max === Infinity ? lista : lista.slice(0, max);
}

module.exports = { maxSabores, ayudaSabores, recortarSabores, MIN_DOS_SABORES, MIN_TRES_SABORES };
