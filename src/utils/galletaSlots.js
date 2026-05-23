/**
 * Utilidades para validar fechas y horarios de entrega de Galletas NY.
 *
 * Reglas:
 *  - Anticipación mínima: 48 horas desde el momento de la compra
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

const HORAS_48 = 48 * 60 * 60 * 1000;

/**
 * Devuelve los slots permitidos según tipo de entrega.
 */
function getSlotsValidos(tipoEntrega) {
  return tipoEntrega === "envio" ? SLOTS_ENVIO : SLOTS_RECOGIDA;
}

/**
 * Valida que la combinación fecha+hora sea legal para Galletas NY.
 *
 * IMPORTANTE — zona horaria:
 * El cliente vive en Guadalajara (America/Mexico_City, UTC-6, sin DST desde
 * 2022). El servidor (Vercel) corre en UTC. La fecha y hora se interpretan
 * SIEMPRE como hora local de Guadalajara — combinamos ambos campos con un
 * offset explícito `-06:00` para evitar el bug clásico:
 *
 *   new Date("2026-05-25")            // → 25 may 00:00 UTC = 24 may 18:00 GDL  ❌
 *   new Date("2026-05-25T10:00-06:00") // → 25 may 10:00 GDL exacto             ✅
 *
 * @param {object} input
 * @param {string} input.fecha — formato "YYYY-MM-DD" (hora local GDL)
 * @param {string} input.hora  — formato "HH:MM" 24h (hora local GDL)
 * @param {"recogida"|"envio"} input.tipoEntrega
 * @returns {{ok:true} | {ok:false, error:string}}
 */
function validarFechaHora({ fecha, hora, tipoEntrega }) {
  // 1) Hora debe ser un slot válido (lo validamos primero para que la
  //    combinación fecha+hora abajo siempre tenga una hora bien formada).
  const slots = getSlotsValidos(tipoEntrega);
  if (!slots.includes(hora)) {
    return {
      ok: false,
      error: `Horario inválido. Disponibles para ${tipoEntrega === "envio" ? "envío" : "recogida"}: ${slots[0]} a ${slots[slots.length - 1]}`,
    };
  }

  // 2) Fecha debe ser "YYYY-MM-DD".
  const fechaStr = typeof fecha === "string" ? fecha : null;
  if (!fechaStr || !/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
    return { ok: false, error: "Fecha inválida" };
  }

  // 3) Construir el momento exacto de entrega en hora local GDL.
  const fechaEntregaMs = Date.parse(`${fechaStr}T${hora}:00-06:00`);
  if (isNaN(fechaEntregaMs)) {
    return { ok: false, error: "Fecha inválida" };
  }

  // 4) Mínimo 48h de anticipación contado desde ahora real.
  const ahora = Date.now();
  if (fechaEntregaMs < ahora + HORAS_48) {
    return { ok: false, error: "La fecha de entrega debe ser al menos 48 horas después de ahora" };
  }

  // 5) No domingos. getDay() del Date local-construido es correcto a nivel
  //    de día (no depende de la TZ del server).
  const [y, m, d] = fechaStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  if (dow === 0) {
    return { ok: false, error: "No realizamos entregas los domingos" };
  }

  return { ok: true };
}

module.exports = {
  SLOTS_RECOGIDA,
  SLOTS_ENVIO,
  getSlotsValidos,
  validarFechaHora,
};
