/**
 * Qué métodos de pago cobran comisión.
 *
 * Solo Stripe y la terminal se llevan un porcentaje. En efectivo y
 * transferencia el dinero entra completo, así que esa comisión que no se
 * pagó es ganancia — y el dashboard debe contarla como tal en vez de
 * descontarla a todo por igual.
 *
 * El valor vacío significa "no se registró el método". No se asume
 * comisión en ese caso (sería inventar un gasto), pero sí se cuenta
 * aparte para poder decir qué parte del mes quedó sin clasificar.
 */

const CON_COMISION = new Set(["stripe", "terminal", "tarjeta"]);

/** true si ese método se lleva un porcentaje. */
function cobraComision(metodo) {
  return CON_COMISION.has(String(metodo || "").trim().toLowerCase());
}

/** true si no se registró con qué se pagó. */
function metodoSinRegistrar(metodo) {
  return !String(metodo || "").trim();
}

module.exports = { cobraComision, metodoSinRegistrar, CON_COMISION };
