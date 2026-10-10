require("dotenv").config();
const nodemailer = require("nodemailer");

/**
 * Invitación a dejar reseña, que sale cuando el pedido pasa a "Entregado".
 *
 * Es un correo de cortesía, no operativo, así que solo se envía a quien
 * aceptó recibir novedades (`aceptaContacto`) — misma regla que el correo
 * de aniversario. Lleva el enlace público del pedido, donde el formulario
 * de reseña ya está disponible.
 */

const FRONT = (process.env.FRONT_DOMAIN || "https://www.pasteleriaelruisenor.com").replace(/\/$/, "");
const WHATSAPP = "https://wa.me/523329295129";

function buildTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

const ASUNTO = "¿Cómo quedó tu pedido? Cuéntanos 🌸";

function html({ nombre, enlace, producto }) {
  const saludo = nombre ? `¡Hola, ${nombre}!` : "¡Hola!";
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #ffe2e7;border-radius:14px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#FFC3C9,#FFA1AA);padding:28px 24px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:1.6rem;">¿Cómo quedó tu pedido? 🌸</h1>
      </div>
      <div style="padding:24px;color:#540027;line-height:1.7;">
        <p style="margin:0 0 14px;">${saludo}</p>
        <p style="margin:0 0 14px;">
          Esperamos que hayas disfrutado ${producto}. Nos encantaría saber qué te
          pareció: tu opinión nos ayuda a mejorar y orienta a otros clientes que
          están decidiendo.
        </p>
        <p style="margin:0 0 18px;">Son dos minutos, de verdad:</p>
        <div style="text-align:center;margin:0 0 20px;">
          <a href="${enlace}" style="display:inline-block;padding:13px 30px;background:#540027;color:#fff;text-decoration:none;border-radius:999px;font-weight:700;">
            Dejar mi reseña
          </a>
        </div>
        <p style="margin:0 0 14px;">
          Y si algo no salió como esperabas, respóndenos este correo o escríbenos
          por <a href="${WHATSAPP}" style="color:#25D366;font-weight:700;">WhatsApp</a> — lo resolvemos.
        </p>
        <p style="margin:0;">Con cariño,<br/><strong>Pastelería El Ruiseñor</strong> 🎂</p>
        <p style="margin:24px 0 0;font-size:0.72rem;color:#a78891;line-height:1.6;border-top:1px solid #ffe2e7;padding-top:14px;">
          Recibes este correo porque aceptaste que te contactáramos. Si ya no
          deseas recibirlos, respóndenos con “BAJA”.
        </p>
      </div>
    </div>`;
}

const texto = ({ nombre, enlace, producto }) => `${nombre ? `¡Hola, ${nombre}!` : "¡Hola!"}

Esperamos que hayas disfrutado ${producto}. Nos encantaría saber qué te pareció: tu opinión nos ayuda a mejorar y orienta a otros clientes.

Deja tu reseña aquí:
${enlace}

Y si algo no salió como esperabas, respóndenos este correo o escríbenos por WhatsApp — lo resolvemos.

Con cariño,
Pastelería El Ruiseñor

—
Recibes este correo porque aceptaste que te contactáramos. Responde "BAJA" para dejar de recibirlos.`;

/**
 * Envía la invitación si corresponde y marca el pedido para no repetirla.
 * Silencioso: nunca interrumpe el guardado del pedido si el correo falla.
 *
 * @param {object} pedido  documento con cliente, publicToken, aceptaContacto
 * @param {"cotizacion"|"vintage"} tipo
 * @returns {Promise<boolean>} si se envió
 */
async function enviarInvitacionResena(pedido, tipo) {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return false;
    if (!pedido?.aceptaContacto) return false;          // no dio consentimiento
    if (pedido.invitacionResenaAt) return false;        // ya se le envió
    if (!pedido.cliente?.email) return false;
    if (!pedido.publicToken) return false;

    const enlace = tipo === "vintage"
      ? `${FRONT}/vintage/ver/${pedido.publicToken}`
      : `${FRONT}/cotizacion/ver/${pedido.publicToken}`;
    const producto = tipo === "vintage" ? "tu Pastel Vintage" : "tu pedido";
    const nombre = (pedido.cliente?.nombre || "").split(" ")[0];

    await buildTransporter().sendMail({
      from: `"Pastelería El Ruiseñor" <${process.env.EMAIL_USER}>`,
      to: pedido.cliente.email,
      subject: ASUNTO,
      text: texto({ nombre, enlace, producto }),
      html: html({ nombre, enlace, producto }),
    });

    pedido.invitacionResenaAt = new Date();
    await pedido.save();
    console.log(`[invitacionResena] enviada a ${pedido.cliente.email} (${pedido.numeroOrden || tipo})`);
    return true;
  } catch (e) {
    console.error("[invitacionResena] no se pudo enviar:", e.message);
    return false;
  }
}

module.exports = { enviarInvitacionResena, ASUNTO };
