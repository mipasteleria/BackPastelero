require("dotenv").config();
const nodemailer = require("nodemailer");

/**
 * Emails transaccionales para Galletas NY.
 *
 * Reusa la misma config de Gmail App Password que ya usamos en
 * /users/forgot-password (EMAIL_USER + EMAIL_PASS en .env).
 */

function buildTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

const STORE_ADDRESS = "Calle Bogotá 2866a, Col. Providencia, Guadalajara, Jalisco";
const STORE_PHONE   = "374 102 5036"; // Temporal — se actualiza cuando haya línea exclusiva
const WHATSAPP_LINK = "https://wa.me/523741025036";

/**
 * Formatea fecha como "Jueves 22 de Mayo, 2026".
 */
function formatearFechaLarga(d) {
  const dias  = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const f = new Date(d);
  return `${dias[f.getDay()]} ${f.getDate()} de ${meses[f.getMonth()]}, ${f.getFullYear()}`;
}

/**
 * HTML de la lista de cajas para el email.
 */
function renderCajas(cajas) {
  return cajas
    .map((caja, i) => {
      const tamano = caja.tamano === "12" ? "Docena (12)" : "Media docena (6)";
      const items = caja.items
        .map(it => `<li style="color:#540027;line-height:1.6;">${it.cantidad}× ${it.saborNombre} <span style="color:#a78891;">($${it.precioUnitario} c/u)</span></li>`)
        .join("");
      const desc = caja.descuento > 0
        ? `<p style="margin:4px 0 0;color:#1D5A45;font-size:0.85rem;">Descuento docena: −$${caja.descuento}</p>`
        : "";
      return `
        <div style="background:#fff1f2;border-radius:10px;padding:14px 16px;margin-bottom:10px;">
          <p style="margin:0 0 6px;font-weight:700;color:#540027;">Caja ${i + 1} — ${tamano}</p>
          <ul style="margin:0;padding-left:18px;font-size:0.9rem;">${items}</ul>
          ${desc}
          <p style="margin:6px 0 0;font-weight:700;color:#540027;text-align:right;">Subtotal: $${caja.total}</p>
        </div>
      `;
    })
    .join("");
}

/**
 * Email al cliente cuando confirma el pago.
 */
async function sendGalletaConfirmation(pedido) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("[galletaEmails] EMAIL_USER/EMAIL_PASS no configurados — no se envía email");
    return;
  }
  const transporter = buildTransporter();

  const fechaTxt = formatearFechaLarga(pedido.fechaEntrega);
  const esEnvio = pedido.tipoEntrega === "envio";

  const bloqueEntrega = esEnvio
    ? `
        <p style="margin:0 0 4px;color:#a78891;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">Envío a domicilio</p>
        <p style="margin:0;color:#540027;line-height:1.6;">${pedido.direccionEnvio.calleNumero}</p>
        <p style="margin:0;color:#540027;line-height:1.6;">Col. ${pedido.direccionEnvio.colonia}, ${pedido.direccionEnvio.municipio}</p>
        ${pedido.direccionEnvio.referencias ? `<p style="margin:0;color:#a78891;font-size:0.85rem;">Ref: ${pedido.direccionEnvio.referencias}</p>` : ""}
        <p style="margin:6px 0 0;font-weight:700;color:#540027;">${fechaTxt} · ${pedido.horaEntrega} hrs</p>
      `
    : `
        <p style="margin:0 0 4px;color:#a78891;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">Recogida en sucursal</p>
        <p style="margin:0;color:#540027;line-height:1.6;">${STORE_ADDRESS}</p>
        <p style="margin:6px 0 0;font-weight:700;color:#540027;">${fechaTxt} · ${pedido.horaEntrega} hrs</p>
      `;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #ffe2e7;border-radius:14px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#FFC3C9,#FFA1AA);padding:28px 24px;text-align:center;">
        <p style="margin:0 0 4px;color:#fff;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;">Galletas NY</p>
        <h1 style="margin:0;color:#fff;font-size:1.7rem;">¡Pago confirmado!</h1>
      </div>

      <div style="padding:24px;">
        <p style="margin:0 0 8px;color:#540027;line-height:1.6;">Hola <strong>${pedido.cliente.nombre}</strong>,</p>
        <p style="margin:0 0 18px;color:#540027;line-height:1.6;">¡Gracias por tu pedido! Aquí están todos los detalles:</p>

        <div style="background:#fff1f2;border-left:4px solid #FF6F7D;border-radius:8px;padding:14px 16px;margin-bottom:18px;">
          <p style="margin:0;color:#a78891;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">Número de orden</p>
          <p style="margin:4px 0 0;font-size:1.4rem;font-weight:800;color:#540027;font-family:'Courier New',monospace;letter-spacing:0.04em;">${pedido.numeroOrden}</p>
        </div>

        <h3 style="color:#540027;font-size:1rem;margin:0 0 10px;">Detalle del pedido</h3>
        ${renderCajas(pedido.cajas)}

        <table style="width:100%;border-collapse:collapse;margin-top:14px;">
          <tr><td style="padding:4px 0;color:#a78891;">Subtotal galletas</td><td style="padding:4px 0;text-align:right;color:#540027;font-weight:600;">$${pedido.subtotalProductos}</td></tr>
          ${pedido.costoEnvio > 0 ? `<tr><td style="padding:4px 0;color:#a78891;">Envío</td><td style="padding:4px 0;text-align:right;color:#540027;font-weight:600;">$${pedido.costoEnvio}</td></tr>` : ""}
          <tr><td style="padding:8px 0;border-top:2px solid #ffe2e7;color:#540027;font-weight:800;">Total pagado</td><td style="padding:8px 0;border-top:2px solid #ffe2e7;text-align:right;color:#540027;font-weight:800;font-size:1.15rem;">$${pedido.total}</td></tr>
        </table>

        <h3 style="color:#540027;font-size:1rem;margin:24px 0 10px;">${esEnvio ? "Tu envío" : "Tu recogida"}</h3>
        <div style="background:#fff;border:1px solid #ffe2e7;border-radius:10px;padding:14px 16px;margin-bottom:18px;">
          ${bloqueEntrega}
        </div>

        ${pedido.notas ? `<div style="background:#FFE99B;border-radius:8px;padding:10px 14px;margin-bottom:18px;"><p style="margin:0;color:#6B4F1A;font-size:0.85rem;"><strong>Nota:</strong> ${pedido.notas}</p></div>` : ""}

        <h3 style="color:#540027;font-size:1rem;margin:18px 0 10px;">Política importante</h3>
        <ul style="color:#540027;line-height:1.6;font-size:0.85rem;padding-left:18px;margin:0 0 18px;">
          <li>Cancelaciones <strong>sin cargo hasta 24 h antes</strong>. Después, no son reembolsables (las galletas se hornean el mismo día).</li>
          <li>Para reportes de calidad, escríbenos en las <strong>2 horas siguientes</strong> a la entrega con foto. <strong>El producto debe ser devuelto físicamente</strong> para procesar reembolso o reposición.</li>
        </ul>

        <div style="text-align:center;margin:24px 0 8px;">
          <a href="${WHATSAPP_LINK}?text=${encodeURIComponent(`Hola, mi número de orden es ${pedido.numeroOrden}`)}" style="display:inline-block;padding:12px 26px;background:#25D366;color:#fff;text-decoration:none;border-radius:999px;font-weight:700;font-size:0.9rem;">
            💬 Contactar por WhatsApp
          </a>
        </div>

        <p style="margin:18px 0 0;color:#a78891;font-size:0.78rem;text-align:center;line-height:1.6;">
          Pastelería El Ruiseñor · ${STORE_ADDRESS}
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Pastelería El Ruiseñor" <${process.env.EMAIL_USER}>`,
    to: pedido.cliente.email,
    subject: `Pedido confirmado · ${pedido.numeroOrden}`,
    html,
  });

  console.log(`[galletaEmails] confirmación enviada a ${pedido.cliente.email} (${pedido.numeroOrden})`);
}

/**
 * Aviso interno al admin cuando uno o más sabores quedan en stock bajo (< 6).
 * El destinatario es ADMIN_EMAIL en .env, o EMAIL_USER por defecto.
 */
async function sendLowStockAlert(saboresBajos) {
  if (!saboresBajos || saboresBajos.length === 0) return;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;

  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
  const transporter = buildTransporter();

  const filas = saboresBajos
    .map(s => `<tr><td style="padding:6px 12px;border-bottom:1px solid #f3e0e4;">${s.emoji || "🍪"} <strong>${s.nombre}</strong></td><td style="padding:6px 12px;border-bottom:1px solid #f3e0e4;text-align:right;color:#FF6F7D;font-weight:800;">${s.stock} pieza${s.stock === 1 ? "" : "s"}</td></tr>`)
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="color:#540027;">⚠️ Stock bajo — Galletas NY</h2>
      <p style="color:#540027;line-height:1.6;">Los siguientes sabores tienen menos de 6 piezas disponibles. Considera reabastecer pronto:</p>
      <table style="width:100%;border-collapse:collapse;background:#fff1f2;border-radius:8px;overflow:hidden;margin-top:8px;">
        ${filas}
      </table>
      <p style="margin-top:18px;color:#a78891;font-size:0.85rem;">Entra al dashboard para ajustar el inventario.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Pastelería El Ruiseñor" <${process.env.EMAIL_USER}>`,
    to: adminEmail,
    subject: `⚠️ Stock bajo — ${saboresBajos.length} sabor${saboresBajos.length === 1 ? "" : "es"} de Galletas NY`,
    html,
  });

  console.log(`[galletaEmails] aviso stock bajo enviado a ${adminEmail} (${saboresBajos.length} sabores)`);
}

module.exports = {
  sendGalletaConfirmation,
  sendLowStockAlert,
};
