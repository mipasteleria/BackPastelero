/**
 * Normaliza un nombre para comparaciones de duplicados / búsqueda.
 *
 * Aplica:
 *  - trim de espacios al inicio/final
 *  - lowercase
 *  - quita acentos / diacríticos (á → a, ñ → n, ü → u, etc.)
 *  - colapsa múltiples espacios internos a uno solo
 *
 * Usado por:
 *  - models/insumos.js (campo `nameNormalized`, indexado)
 *  - routes/insumos.js (validación POST/PUT, endpoint /buscar-similares)
 *  - scripts/dedupe-insumos.js (detección de grupos a fusionar)
 *
 * Ejemplos:
 *  "Harina"             → "harina"
 *  "  Harina  "         → "harina"
 *  "Plátano"            → "platano"
 *  "NUEZ  de macadamia" → "nuez de macadamia"
 *  "Chocolate 70%"      → "chocolate 70%"
 */
function normalizeName(name) {
  if (typeof name !== "string") return "";
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")  // remueve diacríticos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

module.exports = { normalizeName };
