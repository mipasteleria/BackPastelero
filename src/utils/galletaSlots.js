/**
 * Utilidades para validar fechas y horarios de entrega de Galletas NY.
 *
 * Reglas:
 *  - Anticipación mínima: 72 horas desde el momento de la compra
 *  - Días: Lunes a Sábado (no domingo)
 *  - Horarios:
 *      Recogida en sucursal: 10:00 a 18:30 (slots de 30 min)
 *      Envío a domicilio:    11:00 a 17:30 (slots de 30 min)
 */

const SLOTS_RECOGIDA = [
  "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30",
];

const SLOTS_ENVIO = [
  "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30",
];

const HORAS_72 = 72 * 60 * 60 * 1000;

/**
 * Devuelve los slots permitidos según tipo de entrega.
 */
function getSlotsValidos(tipoEntrega) {
  return tipoEntrega === "envio" ? SLOTS_ENVIO : SLOTS_RECOGIDA;
}

/**
 * Valida que la combinación fecha+hora sea legal para Galletas NY.
 *
 * @param {object} input
 * @param {Date|string} input.fecha — fecha de entrega
 * @param {string}      input.hora  — formato "HH:MM" 24h
 * @param {"recogida"|"envio"} input.tipoEntrega
 * @returns {{ok:true} | {ok:false, error:string}}
 */
function validarFechaHora({ fecha, hora, tipoEntrega }) {
  const f = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(f.getTime())) {
    return { ok: false, error: "Fecha inválida" };
  }

  // 1) Mínimo 72h de anticipación.
  const ahora = Date.now();
  if (f.getTime() < ahora + HORAS_72) {
    return { ok: false, error: "La fecha debe ser al menos 72 horas después de hoy" };
  }

  // 2) No domingos. (getDay: 0=Dom, 1=Lun, ..., 6=Sáb)
  const dow = f.getDay();
  if (dow === 0) {
    return { ok: false, error: "No realizamos entregas los domingos" };
  }

  // 3) Hora dentro del rango.
  const slots = getSlotsValidos(tipoEntrega);
  if (!slots.includes(hora)) {
    return {
      ok: false,
      error: `Horario inválido. Disponibles para ${tipoEntrega === "envio" ? "envío" : "recogida"}: ${slots[0]} a ${slots[slots.length - 1]}`,
    };
  }

  return { ok: true };
}

module.exports = {
  SLOTS_RECOGIDA,
  SLOTS_ENVIO,
  getSlotsValidos,
  validarFechaHora,
};
