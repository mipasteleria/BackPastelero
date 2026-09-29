const cron = require("node-cron");
const nodemailer = require("nodemailer");
const CotizacionPersonalizada = require("../models/cotizacionPersonalizada");

/**
 * Correo de aniversario: un año después de que el cliente pidió su
 * cotización personalizada, le recordamos que seguimos aquí.
 *
 * Solo se envía a quien aceptó recibir novedades (`aceptaContacto`) — es
 * un correo comercial, no operativo del pedido. Se manda una sola vez
 * (guard `aniversarioEnviadoAt`) e incluye cómo darse de baja.
 *
 * Igual que los demás jobs, expone `runAniversarioCotizacion` para
 * dispararlo por Vercel Cron además del cron local.
 */

const FRONT = process.env.FRONT_DOMAIN || "https://www.pasteleriaelruisenor.com";

function buildTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

const ASUNTO = "¿Volvemos a crear algo especial juntos? 🎂";

function cuerpoHtml(nombre) {
  const saludo = nombre ? `¡Hola, ${nombre}!` : "¡Hola!";
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #ffe2e7;border-radius:14px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#FFC3C9,#FFA1AA);padding:28px 24px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:1.6rem;">¿Volvemos a crear algo especial juntos? 🎂</h1>
      </div>
      <div style="padding:24px;color:#540027;line-height:1.7;">
        <p style="margin:0 0 14px;">${saludo}</p>
        <p style="margin:0 0 14px;">
          Hace un año nos contactaste para solicitar una cotización personalizada
          para una ocasión muy especial. 💕
        </p>
        <p style="margin:0 0 14px;">
          Hoy, justo en el aniversario de aquella solicitud, queremos recordarte que
          seguimos aquí para ayudarte a crear algo único y hecho especialmente para ti.
        </p>
        <p style="margin:0 0 18px;">
          Si tienes una nueva celebración en puerta, será un placer acompañarte
          nuevamente. Puedes solicitar tu cotización personalizada aquí:
        </p>
        <div style="text-align:center;margin:0 0 20px;">
          <a href="${FRONT}/cotizacion" style="display:inline-block;padding:13px 30px;background:#540027;color:#fff;text-decoration:none;border-radius:999px;font-weight:700;">
            Solicitar mi cotización
          </a>
        </div>
        <p style="margin:0 0 14px;">
          ¡Esperamos volver a ser parte de uno de tus momentos especiales!
        </p>
        <p style="margin:0;">Con cariño,<br/><strong>Pastelería El Ruiseñor</strong> 🎂</p>
        <p style="margin:24px 0 0;font-size:0.72rem;color:#a78891;line-height:1.6;border-top:1px solid #ffe2e7;padding-top:14px;">
          Recibes este correo porque aceptaste que te contactáramos con novedades al
          solicitar tu cotización. Si ya no deseas recibirlos, respóndenos con
          “BAJA” y te retiramos de la lista.
        </p>
      </div>
    </div>`;
}

const textoPlano = (nombre) => `${nombre ? `¡Hola, ${nombre}!` : "¡Hola!"}

Hace un año nos contactaste para solicitar una cotización personalizada para una ocasión muy especial.

Hoy, justo en el aniversario de aquella solicitud, queremos recordarte que seguimos aquí para ayudarte a crear algo único y hecho especialmente para ti.

Si tienes una nueva celebración en puerta, será un placer acompañarte nuevamente. Puedes solicitar tu cotización personalizada aquí:

${FRONT}/cotizacion

¡Esperamos volver a ser parte de uno de tus momentos especiales!

Con cariño,
Pastelería El Ruiseñor

—
Recibes este correo porque aceptaste que te contactáramos con novedades. Responde "BAJA" para dejar de recibirlos.`;

/**
 * Busca cotizaciones creadas hace justo un año (ventana de un día) y envía
 * el recordatorio. Devuelve cuántos correos salieron.
 */
async function runAniversarioCotizacion() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("[aniversarioCotizacion] EMAIL_USER/EMAIL_PASS sin configurar — no se envía nada");
    return 0;
  }

  // Ventana: las creadas entre hace 1 año y 1 día, y hace 1 año.
  // Así un día sin ejecución no se pierde para siempre (se cubre el rango).
  const hace1Anio = new Date();
  hace1Anio.setFullYear(hace1Anio.getFullYear() - 1);
  const inicioVentana = new Date(hace1Anio);
  inicioVentana.setDate(inicioVentana.getDate() - 2);

  const candidatas = await CotizacionPersonalizada.find({
    createdAt: { $gte: inicioVentana, $lte: hace1Anio },
    aniversarioEnviadoAt: null,
    aceptaContacto: true,
    "cliente.email": { $nin: [null, ""] },
  });

  if (candidatas.length === 0) {
    console.log("[aniversarioCotizacion] sin cotizaciones que cumplan un año hoy.");
    return 0;
  }

  const transporter = buildTransporter();
  let enviados = 0;

  for (const cot of candidatas) {
    const nombre = (cot.cliente?.nombre || "").split(" ")[0];
    try {
      await transporter.sendMail({
        from: `"Pastelería El Ruiseñor" <${process.env.EMAIL_USER}>`,
        to: cot.cliente.email,
        subject: ASUNTO,
        text: textoPlano(nombre),
        html: cuerpoHtml(nombre),
      });
      cot.aniversarioEnviadoAt = new Date();
      await cot.save();
      enviados++;
    } catch (e) {
      console.error(`[aniversarioCotizacion] error con ${cot.numeroOrden}:`, e.message);
    }
  }

  console.log(`[aniversarioCotizacion] ${enviados} correo(s) de aniversario enviados de ${candidatas.length} candidatas.`);
  return enviados;
}

/** Cron local: todos los días a las 10:00 (hora del servidor). */
function startAniversarioCotizacionCron() {
  cron.schedule("0 10 * * *", () => {
    runAniversarioCotizacion().catch((e) =>
      console.error("[aniversarioCotizacion] fallo en el cron:", e.message)
    );
  });
  console.log("[aniversarioCotizacion] cron programado (10:00 diario).");
}

module.exports = { runAniversarioCotizacion, startAniversarioCotizacionCron };
