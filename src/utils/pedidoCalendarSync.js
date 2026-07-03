const { createEventoPedido, deleteEvent } = require("./googleCalendar");

/**
 * Sincroniza Google Calendar para los modelos nuevos:
 * CotizacionPersonalizada y PastelVintagePedido.
 *
 * Reglas (idénticas al sync legacy):
 *  - status empieza con "Agendado" y sin calendarEventId → crear evento.
 *  - status "Cancelado" con calendarEventId → borrar evento.
 * No bloquea (corre en background).
 */

const PRODUCTO = {
  pastel: { emoji: "🎂", nombre: "Pastel" },
  cupcake: { emoji: "🧁", nombre: "Cupcakes" },
  "mesa-postres": { emoji: "🍰", nombre: "Mesa de postres" },
  vintage: { emoji: "🎀", nombre: "Pastel Vintage" },
};

function syncPersonalizadaCalendar(Model, cot) {
  if (!cot) return;
  const status = cot.status || "";
  if (status.startsWith("Agendado") && !cot.calendarEventId) {
    const p = PRODUCTO[cot.tipoProducto] || PRODUCTO.pastel;
    const esEnvio = ["domicilio", "evento"].includes(cot.entrega?.tipo);
    createEventoPedido({
      emoji: p.emoji,
      titulo: [p.nombre, cot.evento?.invitados ? `${cot.evento.invitados} porc` : null, cot.cliente?.nombre].filter(Boolean).join(" · "),
      fecha: cot.evento?.fecha,
      hora: cot.entrega?.hora,
      esEnvio,
      location: esEnvio ? (cot.entrega?.direccion || undefined) : undefined,
      refId: cot._id,
      tipoProducto: cot.tipoProducto,
      descripcionLineas: [
        `Orden: ${cot.numeroOrden || cot._id}`,
        `Cliente: ${cot.cliente?.nombre || "—"} · Tel: ${cot.cliente?.telefono || "—"}`,
        cot.sabor?.nombre ? `Sabor: ${cot.sabor.nombre}` : null,
        (cot.saboresCupcake || []).length ? `Sabores: ${cot.saboresCupcake.map((r) => `${r.docenas} doc ${r.nombre}`).join(", ")}` : null,
        cot.relleno?.nombre ? `Relleno: ${cot.relleno.nombre}` : null,
        cot.cobertura?.nombre ? `Cobertura: ${cot.cobertura.nombre}` : null,
        (cot.postres || []).length ? `Postres: ${cot.postres.map((x) => x.nombre).join(", ")}` : null,
        cot.precio != null ? `Precio: $${cot.precio} · Anticipo: $${cot.anticipo ?? "—"} · Saldo: $${cot.saldoPendiente ?? "—"}` : null,
        `Estado: ${status}`,
      ],
    }).then(async (eventId) => {
      if (eventId) await Model.findByIdAndUpdate(cot._id, { $set: { calendarEventId: eventId } });
    }).catch((e) => console.error(`[gcal] sync personalizada ${cot._id}:`, e.message));
    return;
  }
  if (status === "Cancelado" && cot.calendarEventId) {
    deleteEvent(cot.calendarEventId)
      .then(() => Model.findByIdAndUpdate(cot._id, { $set: { calendarEventId: "" } }))
      .catch((e) => console.error(`[gcal] sync delete ${cot._id}:`, e.message));
  }
}

function syncVintageCalendar(Model, pedido) {
  if (!pedido) return;
  const status = pedido.status || "";
  if (status.startsWith("Agendado") && !pedido.calendarEventId) {
    const esEnvio = pedido.envio?.tipo === "domicilio";
    const s = pedido.seleccion || {};
    createEventoPedido({
      emoji: "🎀",
      titulo: ["Pastel Vintage", s.porciones ? `${s.porciones} porc` : null, pedido.cliente?.nombre].filter(Boolean).join(" · "),
      fecha: pedido.fecha,
      hora: pedido.envio?.hora,
      esEnvio,
      location: esEnvio ? [pedido.envio?.direccion, pedido.envio?.colonia, pedido.envio?.municipio].filter(Boolean).join(", ") : undefined,
      refId: pedido._id,
      tipoProducto: "vintage",
      descripcionLineas: [
        `Orden: ${pedido.numeroOrden || pedido._id}`,
        `Cliente: ${pedido.cliente?.nombre || "—"} · Tel: ${pedido.cliente?.telefono || "—"}`,
        s.saborSlug ? `Sabor: ${s.saborSlug}` : null,
        s.rellenoSlug ? `Relleno: ${s.rellenoSlug}` : null,
        s.coberturaSlug ? `Cobertura: ${s.coberturaSlug}` : null,
        (s.decoraciones || []).length ? `Decoraciones: ${s.decoraciones.map((d) => `${d.nombre || d.slug}${d.colorNombre ? ` (${d.colorNombre})` : ""}`).join(", ")}` : null,
        pedido.notas ? `Notas: ${pedido.notas}` : null,
        `Total: $${pedido.total} · Anticipo: $${pedido.anticipo}`,
        `Estado: ${status}`,
      ],
    }).then(async (eventId) => {
      if (eventId) await Model.findByIdAndUpdate(pedido._id, { $set: { calendarEventId: eventId } });
    }).catch((e) => console.error(`[gcal] sync vintage ${pedido._id}:`, e.message));
    return;
  }
  if (status === "Cancelado" && pedido.calendarEventId) {
    deleteEvent(pedido.calendarEventId)
      .then(() => Model.findByIdAndUpdate(pedido._id, { $set: { calendarEventId: "" } }))
      .catch((e) => console.error(`[gcal] sync delete vintage ${pedido._id}:`, e.message));
  }
}

module.exports = { syncPersonalizadaCalendar, syncVintageCalendar };
