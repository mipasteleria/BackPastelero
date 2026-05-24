const { google } = require("googleapis");

/**
 * Integración con Google Calendar para Pastelería El Ruiseñor.
 *
 * Cómo funciona:
 *   - Usamos un Service Account de Google Cloud (no OAuth de usuario)
 *     para que el backend pueda crear/borrar eventos sin intervención.
 *   - El admin debe compartir el calendario de la pastelería con el email
 *     del Service Account, otorgándole permiso "Hacer cambios en eventos".
 *   - Las credenciales del Service Account viven en la variable de entorno
 *     GOOGLE_CALENDAR_CREDENTIALS (string JSON completo del archivo de
 *     credenciales descargado de GCP Console).
 *
 * Variables de entorno requeridas:
 *   GOOGLE_CALENDAR_CREDENTIALS  → JSON completo del service account
 *   GOOGLE_CALENDAR_ID           → email del calendario (o "primary")
 *
 * Si las credenciales no están configuradas, todas las funciones operan
 * en modo no-op: imprimen warning y retornan null. Esto permite que el
 * resto del flujo (pedido, email, stock) funcione aunque Calendar falle.
 */

const TIMEZONE = "America/Mexico_City";

let _calendar = null; // cliente cacheado entre invocaciones tibias de Vercel

/**
 * Construye (y cachea) un cliente autenticado de Calendar.
 * Retorna null si las credenciales no están configuradas.
 */
function getCalendarClient() {
  if (_calendar) return _calendar;

  const raw = process.env.GOOGLE_CALENDAR_CREDENTIALS;
  if (!raw) {
    console.warn("[gcal] GOOGLE_CALENDAR_CREDENTIALS no configurado — Calendar deshabilitado");
    return null;
  }

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch (e) {
    console.error("[gcal] GOOGLE_CALENDAR_CREDENTIALS no es JSON válido:", e.message);
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    _calendar = google.calendar({ version: "v3", auth });
    return _calendar;
  } catch (e) {
    console.error("[gcal] error inicializando Calendar:", e.message);
    return null;
  }
}

function getCalendarId() {
  return process.env.GOOGLE_CALENDAR_ID || "primary";
}

/**
 * Combina fecha (Date o ISO string) + hora "HH:MM" en un timestamp ISO con
 * la zona horaria correcta para Mexico/Guadalajara.
 *
 * Ejemplo: fechaEntrega=2026-05-12, horaEntrega="14:30"
 *  → returns "2026-05-12T14:30:00" (Calendar API combina con TIMEZONE)
 */
function combinarFechaHora(fecha, hora) {
  const f = new Date(fecha);
  // Si fecha viene con hora UTC, igual extraemos solo año/mes/día y le
  // pegamos la hora local que escribió el cliente. Así horaEntrega "14:30"
  // significa 14:30 hora de Guadalajara, no UTC.
  const yyyy = f.getUTCFullYear();
  const mm   = String(f.getUTCMonth() + 1).padStart(2, "0");
  const dd   = String(f.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hora}:00`;
}

/**
 * Suma `minutes` minutos a un timestamp ISO local (sin TZ) y devuelve
 * el resultado en el mismo formato.
 */
function sumarMinutos(isoLocal, minutes) {
  // Parsear como local (no UTC) — Calendar respetará el TIMEZONE del evento
  const [d, t] = isoLocal.split("T");
  const [hh, mm, ss = "00"] = t.split(":");
  const dt = new Date(`${d}T${hh}:${mm}:${ss}`);
  dt.setMinutes(dt.getMinutes() + minutes);
  const yyyy = dt.getFullYear();
  const Mm   = String(dt.getMonth() + 1).padStart(2, "0");
  const dd   = String(dt.getDate()).padStart(2, "0");
  const HH   = String(dt.getHours()).padStart(2, "0");
  const MM   = String(dt.getMinutes()).padStart(2, "0");
  return `${yyyy}-${Mm}-${dd}T${HH}:${MM}:00`;
}

/**
 * Crea un evento en Google Calendar para un pedido de Galletas NY.
 *
 * Retorna el ID del evento creado, o null si Calendar no está configurado
 * o si hubo un error (logueado, no se propaga).
 */
async function createGalletaEvent(pedido) {
  const calendar = getCalendarClient();
  if (!calendar) return null;

  try {
    const totalPiezas = (pedido.cajas || [])
      .reduce((s, c) => s + (c.items || []).reduce((x, it) => x + it.cantidad, 0), 0);
    const numCajas = pedido.cajas?.length || 0;

    // Title formato solicitado: "Tipo de producto + cantidad"
    const summary = `🍪 Galletas NY · ${totalPiezas} pza${numCajas > 1 ? ` (${numCajas} cajas)` : ""} · ${pedido.cliente?.nombre || "Cliente"}`;

    // Description con todo el contexto que el operador necesita
    const sabores = (pedido.cajas || [])
      .map((caja, i) => {
        const tipo = caja.tamano === "12" ? "Docena" : "Media docena";
        const items = (caja.items || [])
          .map(it => `  • ${it.cantidad}× ${it.saborNombre}`)
          .join("\n");
        return `Caja ${i + 1} (${tipo}):\n${items}`;
      })
      .join("\n\n");

    const description = [
      `Número de orden: ${pedido.numeroOrden}`,
      ``,
      `Cliente: ${pedido.cliente?.nombre || "—"}`,
      `Email: ${pedido.cliente?.email || "—"}`,
      `Teléfono: ${pedido.cliente?.telefono || "—"}`,
      ``,
      pedido.tipoEntrega === "envio"
        ? `🚗 Envío a domicilio`
        : `🏪 Recogida en sucursal`,
      ``,
      sabores,
      ``,
      `Subtotal productos: $${pedido.subtotalProductos}`,
      pedido.costoEnvio > 0 ? `Envío: $${pedido.costoEnvio}` : null,
      `Total: $${pedido.total}`,
      ``,
      pedido.notas ? `Notas del cliente: ${pedido.notas}` : null,
    ].filter(Boolean).join("\n");

    // Location según tipo de entrega
    let location = "";
    if (pedido.tipoEntrega === "envio" && pedido.direccionEnvio) {
      const d = pedido.direccionEnvio;
      location = [d.calleNumero, d.colonia, d.municipio, "Jalisco, México"]
        .filter(Boolean).join(", ");
    } else {
      location = "Calle Bogotá 2866a, Col. Providencia, Guadalajara, Jal.";
    }

    // Tiempo: 30 min de duración por defecto
    const startISO = combinarFechaHora(pedido.fechaEntrega, pedido.horaEntrega);
    const endISO   = sumarMinutos(startISO, 30);

    const event = {
      summary,
      description,
      location,
      start: { dateTime: startISO, timeZone: TIMEZONE },
      end:   { dateTime: endISO,   timeZone: TIMEZONE },
      // Color: rosa-claro (id 4 = "Flamingo"). Visualmente distinto de
      // eventos personales del calendario.
      colorId: pedido.tipoEntrega === "envio" ? "11" : "4",
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 24 * 60 },  // 1 día antes
          { method: "popup", minutes: 60 },        // 1 hora antes
        ],
      },
      // Tag con el número de orden para poder buscarlo después
      extendedProperties: {
        private: {
          numeroOrden: pedido.numeroOrden,
          tipoProducto: "galleta_ny",
        },
      },
    };

    const res = await calendar.events.insert({
      calendarId: getCalendarId(),
      requestBody: event,
    });

    console.log(`[gcal] evento creado para ${pedido.numeroOrden}: ${res.data.id}`);
    return res.data.id;
  } catch (e) {
    console.error(`[gcal] error creando evento para ${pedido.numeroOrden}:`, e.message);
    return null;
  }
}

/**
 * Parsea el `deliveryDate` que viene de cotizaciones (pastel/cupcake/snack)
 * con formato "DD/MM/YYYY HH:MM" → { fechaISO: "YYYY-MM-DD", hora: "HH:MM" }.
 *
 * Si el string viene en otro formato (ej. solo fecha sin hora) intentamos
 * un fallback razonable; si nada matchea retorna null para que la lógica
 * superior decida no crear el evento.
 */
function parseDeliveryDateStr(s) {
  if (typeof s !== "string" || !s.trim()) return null;
  // Match "DD/MM/YYYY HH:MM" o "DD/MM/YYYY HH:MM:SS"
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (m) {
    const [, dd, mm, yyyy, hh, min] = m;
    return {
      fechaISO: `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
      hora: `${hh.padStart(2, "0")}:${min}`,
    };
  }
  // Fallback: solo fecha "DD/MM/YYYY" → asumimos 12:00
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return {
      fechaISO: `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
      hora: "12:00",
    };
  }
  // Fallback: "YYYY-MM-DD HH:MM"
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/);
  if (m) {
    const [, yyyy, mm, dd, hh, min] = m;
    return {
      fechaISO: `${yyyy}-${mm}-${dd}`,
      hora: `${hh.padStart(2, "0")}:${min}`,
    };
  }
  return null;
}

/**
 * Crea un evento en Google Calendar para una cotización (pastel/cupcake/snack).
 *
 * @param {object} cotizacion  El documento de cotización con todos sus campos
 * @param {string} tipo        "Pastel" | "Cupcake" | "Snack"
 *
 * Retorna el ID del evento creado, o null si Calendar no está configurado
 * o si la cotización no tiene `deliveryDate` parseable.
 */
async function createCotizacionEvent(cotizacion, tipo) {
  const calendar = getCalendarClient();
  if (!calendar) return null;

  // Sin deliveryDate parseable no podemos agendar. No falla, solo
  // logueamos y devolvemos null.
  const parsed = parseDeliveryDateStr(cotizacion.deliveryDate);
  if (!parsed) {
    console.warn(`[gcal] cotización ${cotizacion._id} sin deliveryDate válido — no se crea evento`);
    return null;
  }

  try {
    const emoji = tipo === "Pastel" ? "🎂" : tipo === "Cupcake" ? "🧁" : "🍫";
    const tipoLower = (tipo || "Pedido").toLowerCase();
    const cantidad = cotizacion.portions ? `${cotizacion.portions} porc` : null;
    const flavor = cotizacion.flavor || "";

    // Title: "🎂 Pastel · 30 porc · Vainilla · {contactName}"
    const summary = [
      `${emoji} ${tipo || "Pedido"}`,
      cantidad,
      flavor,
      cotizacion.contactName,
    ].filter(Boolean).join(" · ");

    const esEnvio = !!(cotizacion.deliveryAdress && String(cotizacion.deliveryAdress).trim());

    const detalles = [
      `Tipo: ${tipo || "—"}`,
      flavor ? `Sabor: ${flavor}` : null,
      cotizacion.stuffedFlavor ? `Relleno: ${cotizacion.stuffedFlavor}` : null,
      cotizacion.cover ? `Cobertura: ${cotizacion.cover}` : null,
      cotizacion.levels ? `Pisos: ${cotizacion.levels}` : null,
      cotizacion.portions ? `Porciones: ${cotizacion.portions}` : null,
    ].filter(Boolean).join("\n");

    const description = [
      `Cliente: ${cotizacion.contactName || "—"}`,
      `Teléfono: ${cotizacion.contactPhone || "—"}`,
      ``,
      esEnvio ? `🚗 Envío a domicilio` : `🏪 Recogida en sucursal`,
      ``,
      detalles,
      ``,
      cotizacion.precio != null ? `Precio total: $${cotizacion.precio}` : null,
      cotizacion.anticipo != null ? `Anticipo: $${cotizacion.anticipo}` : null,
      cotizacion.saldoPendiente != null ? `Saldo pendiente: $${cotizacion.saldoPendiente}` : null,
      cotizacion.status ? `Estado: ${cotizacion.status}` : null,
      ``,
      cotizacion.questionsOrComments ? `Notas del cliente: ${cotizacion.questionsOrComments}` : null,
    ].filter(Boolean).join("\n");

    let location = "Calle Bogotá 2866a, Col. Providencia, Guadalajara, Jal.";
    if (esEnvio) location = cotizacion.deliveryAdress;

    // Tiempo: 60 min de duración por defecto (los pasteles suelen requerir
    // más coordinación que las galletas).
    const startISO = combinarFechaHora(parsed.fechaISO, parsed.hora);
    const endISO   = sumarMinutos(startISO, 60);

    const event = {
      summary,
      description,
      location,
      start: { dateTime: startISO, timeZone: TIMEZONE },
      end:   { dateTime: endISO,   timeZone: TIMEZONE },
      // Color distinto del de Galletas NY (4=Flamingo, 11=Rojo) para
      // distinguir visualmente. 9 = Blueberry (azul) para cotizaciones
      // de recogida; 6 = Tangerine (naranja) para envíos.
      colorId: esEnvio ? "6" : "9",
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 24 * 60 },
          { method: "popup", minutes: 60 },
        ],
      },
      extendedProperties: {
        private: {
          cotizacionId: String(cotizacion._id),
          tipoProducto: tipoLower,
        },
      },
    };

    const res = await calendar.events.insert({
      calendarId: getCalendarId(),
      requestBody: event,
    });

    console.log(`[gcal] evento de cotización creado (${tipo} ${cotizacion._id}): ${res.data.id}`);
    return res.data.id;
  } catch (e) {
    console.error(`[gcal] error creando evento de cotización ${cotizacion._id}:`, e.message);
    return null;
  }
}

/**
 * Elimina un evento por su ID. Útil al cancelar un pedido.
 * No falla si el evento ya no existe.
 */
async function deleteEvent(eventId) {
  if (!eventId) return;
  const calendar = getCalendarClient();
  if (!calendar) return;

  try {
    await calendar.events.delete({
      calendarId: getCalendarId(),
      eventId,
    });
    console.log(`[gcal] evento eliminado: ${eventId}`);
  } catch (e) {
    // 404 = el evento ya no existe (alguien lo borró manualmente). OK.
    if (e.code !== 404 && e.response?.status !== 404) {
      console.error(`[gcal] error eliminando evento ${eventId}:`, e.message);
    }
  }
}

/**
 * Crea un evento en Google Calendar para un pedido del catálogo "Top postres".
 *
 * Mismo patrón que createGalletaEvent pero adaptado al schema de
 * PostrePedido (items individuales con cantidad, no cajas).
 */
async function createPostreEvent(pedido) {
  const calendar = getCalendarClient();
  if (!calendar) return null;

  try {
    const totalPiezas = (pedido.items || []).reduce((s, it) => s + (it.cantidad || 0), 0);
    const nombresUnicos = [...new Set((pedido.items || []).map((it) => it.nombre))];
    const resumenItems = nombresUnicos.length === 1
      ? nombresUnicos[0]
      : `${nombresUnicos.length} postres`;

    const summary = `🎂 ${resumenItems} · ${totalPiezas} pza${totalPiezas !== 1 ? "s" : ""} · ${pedido.cliente?.nombre || "Cliente"}`;

    const detalleItems = (pedido.items || [])
      .map((it) => `  • ${it.cantidad}× ${it.nombre} ($${it.precioUnitario} c/u)`)
      .join("\n");

    const description = [
      `Número de orden: ${pedido.numeroOrden}`,
      ``,
      `Cliente: ${pedido.cliente?.nombre || "—"}`,
      `Email: ${pedido.cliente?.email || "—"}`,
      `Teléfono: ${pedido.cliente?.telefono || "—"}`,
      ``,
      pedido.tipoEntrega === "envio" ? `🚗 Envío a domicilio` : `🏪 Recogida en sucursal`,
      ``,
      `Postres:`,
      detalleItems,
      ``,
      `Subtotal: $${pedido.subtotalProductos}`,
      pedido.costoEnvio > 0 ? `Envío: $${pedido.costoEnvio}` : null,
      `Total: $${pedido.total}`,
      ``,
      pedido.notas ? `Notas del cliente: ${pedido.notas}` : null,
    ].filter(Boolean).join("\n");

    let location = "";
    if (pedido.tipoEntrega === "envio" && pedido.direccionEnvio) {
      const d = pedido.direccionEnvio;
      location = [d.calleNumero, d.colonia, d.municipio, "Jalisco, México"]
        .filter(Boolean).join(", ");
    } else {
      location = "Calle Bogotá 2866a, Col. Providencia, Guadalajara, Jal.";
    }

    const startISO = combinarFechaHora(pedido.fechaEntrega, pedido.horaEntrega);
    const endISO   = sumarMinutos(startISO, 30);

    const event = {
      summary,
      description,
      location,
      start: { dateTime: startISO, timeZone: TIMEZONE },
      end:   { dateTime: endISO,   timeZone: TIMEZONE },
      // colorId distinto del de galletas (5 = "Banana") para que en
      // el calendario se distingan postres vs galletas a simple vista.
      colorId: pedido.tipoEntrega === "envio" ? "9" : "5",
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 24 * 60 },
          { method: "popup", minutes: 60 },
        ],
      },
      extendedProperties: {
        private: {
          numeroOrden: pedido.numeroOrden,
          tipoProducto: "postre",
        },
      },
    };

    const res = await calendar.events.insert({
      calendarId: getCalendarId(),
      requestBody: event,
    });

    console.log(`[gcal] evento creado para ${pedido.numeroOrden}: ${res.data.id}`);
    return res.data.id;
  } catch (e) {
    console.error(`[gcal] error creando evento postre para ${pedido.numeroOrden}:`, e.message);
    return null;
  }
}

module.exports = {
  getCalendarClient,
  createGalletaEvent,
  createPostreEvent,
  createCotizacionEvent,
  parseDeliveryDateStr,
  deleteEvent,
};
