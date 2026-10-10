const Resena = require("../models/resena");

/**
 * Reseñas de pedidos hechos a la medida (cotización personalizada y pastel
 * vintage), que se dejan desde el enlace público sin necesidad de cuenta.
 *
 * Tres reglas, iguales para ambos productos:
 *   1. Solo pedidos a la medida — los de catálogo tienen su propio flujo
 *      en /resenas, con verificación de compra.
 *   2. Solo cuando el pedido está "Entregado".
 *   3. Una sola reseña por pedido: si vuelve a enviar, se actualiza. El
 *      índice único {pedido.pedidoId, pedido.tipo} lo respalda en la base.
 *
 * Tener el token del enlace es la prueba de que el pedido es suyo, así que
 * no se pide sesión — es el mismo criterio que para confirmar o pagar.
 */

const TIPOS_VALIDOS = new Set(["cotizacion", "vintage"]);

/** Valida la calificación recibida del cliente. */
function validarRating(valor) {
  const rating = Number(valor);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "La calificación debe ser de 1 a 5 estrellas" };
  }
  return { ok: true, rating };
}

/** ¿El pedido ya se entregó? Vintage y cotización usan el mismo texto. */
function estaEntregado(status) {
  return String(status || "").trim() === "Entregado";
}

/**
 * Crea o actualiza la reseña de un pedido a la medida.
 *
 * @param {object} opts
 * @param {"cotizacion"|"vintage"} opts.tipo
 * @param {object} opts.pedido      documento del pedido (ya validado como suyo)
 * @param {string} opts.nombreProducto  cómo se llama en la reseña
 * @param {string} opts.slug        identificador legible del producto
 * @param {number|string} opts.rating
 * @param {string} opts.texto
 * @returns {{status:number, body:object}} respuesta lista para el router
 */
async function guardarResenaPedido({ tipo, pedido, nombreProducto, slug, rating, texto }) {
  if (!TIPOS_VALIDOS.has(tipo)) {
    return { status: 400, body: { message: "Tipo de pedido no admite reseña" } };
  }
  const val = validarRating(rating);
  if (!val.ok) return { status: 400, body: { message: val.error } };

  if (!estaEntregado(pedido.status)) {
    return { status: 409, body: { message: "Podrás dejar tu reseña cuando tu pedido esté entregado." } };
  }

  const comentario = String(texto || "").trim().slice(0, 1000);

  const existente = await Resena.findOne({ "pedido.pedidoId": pedido._id, "pedido.tipo": tipo });
  if (existente) {
    existente.rating = val.rating;
    existente.texto = comentario;
    await existente.save();
    return { status: 200, body: { message: "Reseña actualizada", data: { rating: val.rating, texto: comentario } } };
  }

  await Resena.create({
    usuario: {
      userId: pedido.userId || null,
      nombre: pedido.cliente?.nombre || "Cliente",
      email: pedido.cliente?.email || "",
    },
    producto: { tipo, productoId: pedido._id, slug, nombre: nombreProducto },
    pedido: { pedidoId: pedido._id, tipo, numeroOrden: pedido.numeroOrden || "" },
    rating: val.rating,
    texto: comentario,
  });

  return { status: 201, body: { message: "¡Gracias por tu reseña!", data: { rating: val.rating, texto: comentario } } };
}

/** La reseña de un pedido, para prellenar el formulario. */
async function resenaDePedido(pedidoId, tipo) {
  const r = await Resena.findOne({ "pedido.pedidoId": pedidoId, "pedido.tipo": tipo }).select("rating texto");
  return r ? { rating: r.rating, texto: r.texto } : null;
}

module.exports = { guardarResenaPedido, resenaDePedido, estaEntregado, TIPOS_VALIDOS };
