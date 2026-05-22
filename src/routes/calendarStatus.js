const express = require("express");
const router = express.Router();
const { google } = require("googleapis");
const checkRoleToken = require("../middlewares/myRoleToken");
const GalletaPedido = require("../models/galletaPedido");
const { createGalletaEvent } = require("../utils/googleCalendar");

/**
 * Endpoints de diagnóstico para Google Calendar.
 *
 * Útil cuando el admin configura GOOGLE_CALENDAR_CREDENTIALS y
 * GOOGLE_CALENDAR_ID por primera vez y los eventos no aparecen — este
 * endpoint ejecuta cada paso de la cadena (env vars → parse → auth →
 * listar eventos → crear evento de prueba → borrar evento de prueba)
 * y reporta exactamente dónde falla, sin que tengas que mirar logs.
 *
 * Devuelve siempre 200 con un JSON estructurado para que sea fácil de
 * leer en el navegador (con la extensión JSON viewer o cualquier
 * cliente REST).
 */

const TIMEZONE = "America/Mexico_City";

function step(name, ok, detail) {
  return { step: name, ok, ...detail };
}

router.get("/calendar-status", checkRoleToken("admin"), async (req, res) => {
  const results = [];
  let credentials = null;
  let calendar = null;

  // 1) Env var GOOGLE_CALENDAR_CREDENTIALS presente
  const raw = process.env.GOOGLE_CALENDAR_CREDENTIALS;
  if (!raw) {
    results.push(step("env_credentials", false, {
      hint: "Falta GOOGLE_CALENDAR_CREDENTIALS en Vercel. Settings → Environment Variables → Production",
    }));
    return res.json({ ok: false, results });
  }
  results.push(step("env_credentials", true, { length: raw.length }));

  // 2) Parse JSON
  try {
    credentials = JSON.parse(raw);
  } catch (e) {
    results.push(step("parse_json", false, {
      error: e.message,
      hint: "La env var no es JSON válido. Probablemente quedó truncado o con caracteres extra. Pega el contenido COMPLETO del archivo .json descargado de GCP",
    }));
    return res.json({ ok: false, results });
  }
  results.push(step("parse_json", true, {
    client_email: credentials.client_email,
    project_id: credentials.project_id,
    has_private_key: !!credentials.private_key,
  }));

  // 3) Env var GOOGLE_CALENDAR_ID presente
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    results.push(step("env_calendar_id", false, {
      hint: "Falta GOOGLE_CALENDAR_ID en Vercel. Sácalo de Calendar → Settings del calendario → Integrate calendar → Calendar ID",
    }));
    return res.json({ ok: false, results });
  }
  results.push(step("env_calendar_id", true, { calendarId }));

  // 4) Autenticación
  try {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    calendar = google.calendar({ version: "v3", auth });
    // Forzar generación del token para validar credenciales
    const authClient = await auth.getClient();
    await authClient.authorize();
  } catch (e) {
    results.push(step("auth", false, {
      error: e.message,
      hint: "Las credenciales del service account no son válidas o la Calendar API no está habilitada en el proyecto GCP",
    }));
    return res.json({ ok: false, results });
  }
  results.push(step("auth", true));

  // 5) Listar eventos (verifica acceso de lectura al calendar)
  try {
    const list = await calendar.events.list({
      calendarId,
      maxResults: 1,
    });
    results.push(step("read_calendar", true, {
      calendarSummary: list.data.summary || "(sin nombre)",
      eventos_visibles: list.data.items?.length || 0,
    }));
  } catch (e) {
    let hint = e.message;
    if (e.code === 404 || /Not Found/i.test(e.message)) {
      hint = `Calendar ID inválido o el service account (${credentials.client_email}) NO tiene acceso al calendario. Compártelo: Calendar → Settings → Share with specific people → agrega ${credentials.client_email} con permiso "Make changes to events"`;
    } else if (e.code === 403 || /Forbidden|insufficient/i.test(e.message)) {
      hint = `El service account no tiene permiso. Asegúrate de compartir el calendario con ${credentials.client_email} y darle "Make changes to events" (no solo "See all event details")`;
    }
    results.push(step("read_calendar", false, { error: e.message, code: e.code, hint }));
    return res.json({ ok: false, results });
  }

  // 6) Crear evento de prueba (verifica permiso de escritura)
  let testEventId = null;
  try {
    const now = new Date();
    const start = new Date(now.getTime() + 30 * 60 * 1000); // +30 min
    const end   = new Date(start.getTime() + 15 * 60 * 1000); // 15 min de duración
    const evt = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: "🧪 Test de diagnóstico — borra este evento",
        description: `Creado por GET /admin/calendar-status a las ${now.toISOString()}. Si lees esto, el integration funciona. Se eliminará automáticamente.`,
        start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
        end:   { dateTime: end.toISOString(),   timeZone: TIMEZONE },
      },
    });
    testEventId = evt.data.id;
    results.push(step("write_calendar", true, { testEventId, htmlLink: evt.data.htmlLink }));
  } catch (e) {
    let hint = e.message;
    if (e.code === 403 || /Forbidden|insufficient/i.test(e.message)) {
      hint = `El service account puede leer pero no escribir. En el calendar, sube el permiso a "Make changes to events" (no "See all event details")`;
    }
    results.push(step("write_calendar", false, { error: e.message, code: e.code, hint }));
    return res.json({ ok: false, results });
  }

  // 7) Limpiar el evento de prueba
  if (testEventId) {
    try {
      await calendar.events.delete({ calendarId, eventId: testEventId });
      results.push(step("cleanup", true));
    } catch (e) {
      results.push(step("cleanup", false, {
        error: e.message,
        hint: "El evento se creó pero no se pudo borrar. Bórralo manualmente desde Calendar — no es bloqueante",
      }));
    }
  }

  res.json({ ok: true, results, summary: "Calendar configurado correctamente. Los próximos pedidos crearán eventos." });
});

/**
 * Diagnóstico de un pedido específico de Galletas NY:
 * - Muestra los campos relevantes que decide el hook de Calendar
 *   (estado, estadoPago, calendarEventId, fechaEntrega, horaEntrega).
 * - Reporta si las CONDICIONES están cumplidas para que el hook
 *   cree evento.
 * - Si pasas ?force=true, ejecuta createGalletaEvent SIN evaluar
 *   condiciones — útil para confirmar que la función misma funciona
 *   con los datos de este pedido, y para recuperar un pedido
 *   cuyo evento se perdió.
 */
router.get("/pedido-calendar-debug/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const pedido = await GalletaPedido.findById(req.params.id);
    if (!pedido) return res.status(404).json({ message: "Pedido no encontrado" });

    const estadoTriggerStates = ["confirmado", "en_preparacion", "listo"];
    const conditionEstado    = estadoTriggerStates.includes(pedido.estado);
    const conditionSinEvento = !pedido.calendarEventId;
    const conditionPagado    = pedido.estadoPago === "paid";
    const conditionsMet      = conditionEstado && conditionSinEvento && conditionPagado;

    const checks = {
      "estado in [confirmado, en_preparacion, listo]": conditionEstado,
      "calendarEventId vacío": conditionSinEvento,
      "estadoPago === paid": conditionPagado,
    };

    const snapshot = {
      _id: pedido._id,
      numeroOrden: pedido.numeroOrden,
      estado: pedido.estado,
      estadoPago: pedido.estadoPago,
      calendarEventId: pedido.calendarEventId || "(empty)",
      fechaEntrega: pedido.fechaEntrega,
      horaEntrega: pedido.horaEntrega,
      tipoEntrega: pedido.tipoEntrega,
      cliente: pedido.cliente,
    };

    if (req.query.force !== "true") {
      return res.json({
        pedido: snapshot,
        checks,
        conditionsMet,
        hint: conditionsMet
          ? "Las condiciones SÍ se cumplen. Si aún así no se crea el evento, pasa ?force=true para forzar."
          : "Las condiciones NO se cumplen — por eso el hook no dispara. Arregla los `false` arriba antes de cambiar estado.",
      });
    }

    // Force mode: crear evento ignorando condiciones
    const eventId = await createGalletaEvent(pedido);
    if (eventId) {
      pedido.calendarEventId = eventId;
      await pedido.save();
      return res.json({
        pedido: snapshot,
        checks,
        forced: true,
        eventId,
        message: "Evento creado forzadamente y guardado en el pedido.",
      });
    }
    return res.json({
      pedido: snapshot,
      checks,
      forced: true,
      eventId: null,
      message: "createGalletaEvent retornó null — revisa logs del back (probablemente fechaEntrega/horaEntrega inválidos o Calendar API arrojó error).",
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
