/**
 * Reglas de cantidad para productos que se venden con mínimo e incremento
 * (postres y galletas artesanales). Un producto define:
 *   unidad: "pieza" | "docena" | "kg"
 *   minimo: cantidad mínima en esa unidad (ej. 6 piezas, 0.5 kg)
 *   paso:   incremento permitido (ej. de 6 en 6, de 0.5 en 0.5)
 *
 * Se valida en el servidor porque el cliente puede manipular el carrito.
 */

const LABEL_UNIDAD = {
  pieza:  { sing: "pieza",  plural: "piezas" },
  docena: { sing: "docena", plural: "docenas" },
  kg:     { sing: "kg",     plural: "kg" },
};

/** Texto legible de una cantidad, ej. "6 piezas" / "1.5 kg". */
function etiquetaCantidad(cantidad, unidad) {
  const l = LABEL_UNIDAD[unidad] || LABEL_UNIDAD.pieza;
  const n = Number(cantidad) || 0;
  return `${n} ${n === 1 ? l.sing : l.plural}`;
}

// Comparación tolerante a flotantes (0.5 kg y similares).
const casiIgual = (a, b) => Math.abs(a - b) < 1e-9;

/**
 * Valida la cantidad pedida contra las reglas del producto.
 * Devuelve { ok: true } o { ok: false, error: "mensaje para el cliente" }.
 */
function validarCantidad(producto, cantidad) {
  const n = Number(cantidad);
  const unidad = producto?.unidad || "pieza";
  const minimo = Number(producto?.minimo) > 0 ? Number(producto.minimo) : 1;
  const paso = Number(producto?.paso) > 0 ? Number(producto.paso) : 1;
  const nombre = producto?.nombre || "el producto";

  if (!n || n <= 0 || isNaN(n)) {
    return { ok: false, error: `Cantidad inválida para "${nombre}"` };
  }
  if (n < minimo && !casiIgual(n, minimo)) {
    return { ok: false, error: `"${nombre}" tiene un mínimo de ${etiquetaCantidad(minimo, unidad)}` };
  }
  // Las piezas y docenas no admiten fracciones; el peso sí.
  if (unidad !== "kg" && !Number.isInteger(n)) {
    return { ok: false, error: `"${nombre}" se vende en ${LABEL_UNIDAD[unidad].plural} completas` };
  }
  // El excedente sobre el mínimo debe caer en múltiplos del paso.
  if (paso > 0) {
    const excedente = n - minimo;
    const multiplos = excedente / paso;
    if (excedente < 0 || !casiIgual(multiplos, Math.round(multiplos))) {
      return {
        ok: false,
        error: `"${nombre}" se pide desde ${etiquetaCantidad(minimo, unidad)} y de ${etiquetaCantidad(paso, unidad)} en ${etiquetaCantidad(paso, unidad)}`,
      };
    }
  }
  return { ok: true };
}

module.exports = { validarCantidad, etiquetaCantidad, LABEL_UNIDAD };
