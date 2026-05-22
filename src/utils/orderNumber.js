const OrderCounter = require("../models/orderCounter");

/**
 * Genera un número de orden único en el formato:
 *   <PREFIJO>-<DDMMMYY>-<NNNN>
 *
 * Ejemplos:
 *   GNY-07MAY26-0001  (Galletas NY)
 *   PAS-07MAY26-0002  (Pastel personalizado)
 *   CUP-07MAY26-0003  (Cupcakes)
 *   SNA-07MAY26-0004  (Mesa de postres / Snack)
 *   VIN-08MAY26-0005  (Vintage Cake)
 *
 * El consecutivo es global (compartido entre TODOS los productos) y nunca
 * se reinicia — garantiza unicidad absoluta.
 *
 * @param {string} prefijo  Código de 3 letras del producto (GNY, PAS, etc.)
 * @returns {Promise<{numeroOrden: string, consecutivo: number}>}
 */
const MESES_ABREV = [
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
  "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
];

const PREFIJOS_VALIDOS = new Set(["GNY", "PAS", "CUP", "SNA", "VIN"]);

async function generarNumeroOrden(prefijo) {
  const pfx = String(prefijo || "").toUpperCase();
  if (!PREFIJOS_VALIDOS.has(pfx)) {
    throw new Error(
      `Prefijo inválido: ${prefijo}. Debe ser uno de: ${[...PREFIJOS_VALIDOS].join(", ")}`
    );
  }

  // Incremento atómico — Mongo garantiza que dos requests en paralelo
  // obtengan números distintos sin race condition.
  const counter = await OrderCounter.findOneAndUpdate(
    { _id: "global" },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mmm = MESES_ABREV[now.getMonth()];
  const yy = String(now.getFullYear()).slice(-2);
  const seq = String(counter.seq).padStart(4, "0");

  return {
    numeroOrden: `${pfx}-${dd}${mmm}${yy}-${seq}`,
    consecutivo: counter.seq,
  };
}

module.exports = { generarNumeroOrden, PREFIJOS_VALIDOS };
