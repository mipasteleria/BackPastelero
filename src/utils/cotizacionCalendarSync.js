const { createCotizacionEvent, deleteEvent } = require("./googleCalendar");

/**
 * Sincroniza Google Calendar con el estado actual de una cotización.
 *
 * Llamar después de un `findByIdAndUpdate` u otra mutación que toque
 * `status` o `calendarEventId`. No bloquea (corre en background).
 *
 * Reglas:
 *   - Si status empieza con "Agendado" y no hay calendarEventId todavía
 *     → crea evento y guarda el id.
 *   - Si status === "Cancelado" y hay calendarEventId → borra el evento
 *     y limpia el id.
 *   - Cualquier otra transición no toca Calendar (idempotencia).
 *
 * @param {mongoose.Model} Model    El modelo (Pastel/Cupcake/Snack Cotiza)
 * @param {object} cotizacion       El documento ya actualizado
 * @param {string} tipo             "Pastel" | "Cupcake" | "Snack"
 */
function syncCotizacionCalendar(Model, cotizacion, tipo) {
  if (!cotizacion) return;
  const status = cotizacion.status || "";
  const isAgendado = status.startsWith("Agendado");
  const isCancelado = status === "Cancelado";

  if (isAgendado && !cotizacion.calendarEventId) {
    // Transición a Agendado sin evento todavía → crearlo
    createCotizacionEvent(cotizacion, tipo)
      .then(async (eventId) => {
        if (eventId) {
          await Model.findByIdAndUpdate(cotizacion._id, { $set: { calendarEventId: eventId } });
        }
      })
      .catch(e => console.error(`[gcal] error sync create ${tipo} ${cotizacion._id}:`, e.message));
    return;
  }

  if (isCancelado && cotizacion.calendarEventId) {
    // Cancelación → borrar evento y limpiar el id
    const eventIdAnterior = cotizacion.calendarEventId;
    deleteEvent(eventIdAnterior)
      .then(async () => {
        await Model.findByIdAndUpdate(cotizacion._id, { $set: { calendarEventId: "" } });
      })
      .catch(e => console.error(`[gcal] error sync delete ${tipo} ${cotizacion._id}:`, e.message));
  }
}

module.exports = { syncCotizacionCalendar };
