const cron = require("node-cron");
const nodemailer = require("nodemailer");
const CotizacionPersonalizada = require("../models/cotizacionPersonalizada");

/**
 * Recordatorios de cotización activa (CotizacionPersonalizada).
 *
 * Si el cliente aún NO agenda (status distinto de Agendado/Entregado/
 * Cancelado) y su evento se acerca, se le envían hasta dos correos:
 *  - 7 días antes del evento: recordatorio amistoso.
 *  - 3 días antes: última oportunidad.
 * Cada uno se envía una sola vez (flags recordatorioSemanaAt /
 * recordatorioTresDiasAt).
 *
 * Igual que la limpieza de imágenes, expone `runCotizacionReminders`
 * para dispararlo vía Vercel Cron además del cron local.
 */

const FRONT = process.env.FRONT_DOMAIN || "https://www.pasteleriaelruisenor.com";

function buildTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

// Días (UTC, date-only) entre hoy y la fecha del evento.
function diasParaEvento(fecha) {
  if (!fecha) return null;
  const hoy = new Date();
  const hoyUTC = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  const f = new Date(fecha);
  const evUTC = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate());
  return Math.round((evUTC - hoyUTC) / 86400000);
}

async function enviarRecordatorio(transporter, cot, ultimaOportunidad) {
  const to = cot.cliente?.email;
  if (!to) return false;
  const link = `${FRONT}/cotizacion/ver/${cot.publicToken}`;
  const fechaEvento = new Date(cot.evento.fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });

  await transporter.sendMail({
    from: `Pastelería el Ruiseñor <${process.env.EMAIL_USER}>`,
    to,
    subject: ultimaOportunidad
      ? `⏰ Última oportunidad — tu evento es en 3 días (${cot.numeroOrden || ""})`
      : `🌸 Tu cotización sigue activa — tu evento se acerca (${cot.numeroOrden || ""})`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#3a3a3a;max-width:560px">
        <h2 style="color:#540027">Hola ${cot.cliente?.nombre || ""} 👋</h2>
        ${ultimaOportunidad
          ? `<p>Tu evento es el <strong>${fechaEvento}</strong> — ¡en solo 3 días! Esta es tu <strong>última oportunidad</strong> para apartar tu fecha con el 50% de anticipo.</p>`
          : `<p>Vimos que tu evento es el <strong>${fechaEvento}</strong> y tu cotización sigue <strong>activa</strong>. Aún estás a tiempo de apartar tu fecha con el 50% de anticipo.</p>`}
        <p style="margin:20px 0">
          <a href="${link}" style="background:#FF6F7D;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold">Ver mi cotización</a>
        </p>
        <p style="font-size:13px;color:#888">Si ya no la necesitas, puedes ignorar este correo. Horario de atención: Lun–Vie 9am–6pm. 🌸</p>
      </div>`,
  });
  return true;
}

async function runCotizacionReminders() {
  const activas = await CotizacionPersonalizada.find({
    status: { $nin: ["Agendado · revisión", "Agendado · producción", "Entregado", "Cancelado"] },
    "evento.fecha": { $gte: new Date() },
    "cliente.email": { $ne: "" },
  });

  let enviados = 0;
  const transporter = buildTransporter();

  for (const cot of activas) {
    const dias = diasParaEvento(cot.evento?.fecha);
    if (dias == null) continue;
    try {
      if (dias <= 3 && !cot.recordatorioTresDiasAt) {
        if (await enviarRecordatorio(transporter, cot, true)) {
          await cot.updateOne({ recordatorioTresDiasAt: new Date() });
          enviados++;
        }
      } else if (dias <= 7 && dias > 3 && !cot.recordatorioSemanaAt) {
        if (await enviarRecordatorio(transporter, cot, false)) {
          await cot.updateOne({ recordatorioSemanaAt: new Date() });
          enviados++;
        }
      }
    } catch (e) {
      console.error(`[cotizacionReminders] error con ${cot._id}:`, e.message);
    }
  }

  console.log(`[cotizacionReminders] ${enviados} recordatorio(s) enviados de ${activas.length} activas.`);
  return { enviados, activas: activas.length };
}

function startCotizacionRemindersCron() {
  cron.schedule("30 9 * * *", async () => {
    try { await runCotizacionReminders(); }
    catch (e) { console.error("[cotizacionReminders] error:", e.message); }
  });
  console.log("[cotizacionReminders] Cron registrado (09:30 diario)");
}

module.exports = { startCotizacionRemindersCron, runCotizacionReminders };
