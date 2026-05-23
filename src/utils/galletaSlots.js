/**
 * Utilidades para validar fechas y horarios de entrega de Galletas NY.
 *
 * Reglas:
 *  - Anticipación mínima: 2 días hábiles completos de preparación entre el
 *    día de la compra y el día de entrega. Domingo NO cuenta como día de
 *    preparación (no se trabaja).
 *  - Días de entrega: Lunes a Sábado (no domingo)
 *  - Horarios:
 *      Recogida en sucursal: 10:00 a 18:30 (slots de 30 min)
 *      Envío a domicilio:    11:00 a 17:30 (slots de 30 min)
 *
 * Ejemplos de primer día de entrega válido por día de compra:
 *  - Lunes    → jueves     (martes, miércoles = 2 días prep)
 *  - Martes   → viernes
 *  - Miércoles→ sábado
 *  - Jueves   → lunes      (viernes, sábado = 2 días prep; domingo skip)
 *  - Viernes  → martes     (sábado, lunes = 2 días prep; domingo skip)
 *  - Sábado   → miércoles  (lunes, martes = 2 días prep; domingo skip)
 *  - Domingo  → miércoles  (lunes, martes = 2 días prep)
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

const DIAS_PREPARACION = 2;

/**
 * Devuelve los slots permitidos según tipo de entrega.
 */
function getSlotsValidos(tipoEntrega) {
  return tipoEntrega === "envio" ? SLOTS_ENVIO : SLOTS_RECOGIDA;
}

/**
 * Dado un Date (fecha de compra/referencia, hora local GDL), devuelve el
 * primer día de entrega válido como Date a medianoche local GDL.
 *
 * Lógica: a partir del día siguiente al de compra, contar `DIAS_PREPARACION`
 * días hábiles (lunes-sábado), saltando domingos. El día de entrega es el
 * SIGUIENTE día después de ese conteo. Si cae en domingo, saltar al lunes.
 *
 * @param {Date} desde — referencia (default: ahora)
 * @returns {Date} primer día de entrega válido a 00:00 local GDL
 */
function primerDiaEntregaValido(desde = new Date()) {
  const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  let habilesAcumulados = 0;
  while (habilesAcumulados < DIAS_PREPARACION) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) habilesAcumulados++;
  }
  // d es el último día de los 2 hábiles de preparación. Entrega = siguiente.
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d;
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
  // 1) Hora debe ser un slot válido.
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

  // 3) Construir el momento exacto de entrega y de "ahora" en hora local GDL.
  //    Comparamos ambos a nivel de día (UTC-6) — qué tan temprano es la hora
  //    no importa para la regla de 2 días hábiles, solo el día calendario.
  const fechaEntregaMs = Date.parse(`${fechaStr}T${hora}:00-06:00`);
  if (isNaN(fechaEntregaMs)) {
    return { ok: false, error: "Fecha inválida" };
  }

  // 4) Validar que sea >= primer día válido (regla 2 días hábiles).
  //    Para calcular "hoy en GDL" desde un server UTC, construimos un Date
  //    cuya partes (y,m,d) son las del momento actual en GDL.
  const ahoraGdl = new Date(Date.now() - 6 * 60 * 60 * 1000); // UTC-6 sin DST
  const minDate = primerDiaEntregaValido(
    new Date(ahoraGdl.getUTCFullYear(), ahoraGdl.getUTCMonth(), ahoraGdl.getUTCDate())
  );
  const [y, m, d] = fechaStr.split("-").map(Number);
  const fechaSoloDia = new Date(y, m - 1, d);
  if (fechaSoloDia.getTime() < minDate.getTime()) {
    return {
      ok: false,
      error: "La fecha de entrega requiere al menos 2 días hábiles de preparación (no contamos domingos)",
    };
  }

  // 5) No domingos.
  const dow = fechaSoloDia.getDay();
  if (dow === 0) {
    return { ok: false, error: "No realizamos entregas los domingos" };
  }

  return { ok: true };
}

module.exports = {
  SLOTS_RECOGIDA,
  SLOTS_ENVIO,
  DIAS_PREPARACION,
  getSlotsValidos,
  primerDiaEntregaValido,
  validarFechaHora,
};
