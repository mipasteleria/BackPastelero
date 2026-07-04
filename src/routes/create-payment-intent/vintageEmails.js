require("dotenv").config();
const nodemailer = require("nodemailer");

/**
 * Emails transaccionales para Pastel Vintage. Reusa la config de Gmail
 * (EMAIL_USER + EMAIL_PASS) igual que galletas/postres. El desglose que ve
 * el cliente incluye solo concepto y precio — nunca costo ni margen.
 */

function buildTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

const STORE_ADDRESS = "Calle Bogotá 2866a, Col. Providencia, Guadalajara, Jalisco";
const WHATSAPP_LINK = "https://wa.me/523741025036";

function formatearFechaLarga(d) {
  if (!d) return "Por confirmar";
  const dias  = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const f = new Date(d);
  // Fecha guardada a medianoche UTC → formatear en UTC para no correr un día.
  return `${dias[f.getUTCDay()]} ${f.getUTCDate()} de ${meses[f.getUTCMonth()]}, ${f.getUTCFullYear()}`;
}

const money = (n) => `$${Number(n || 0).toLocaleString("es-MX")}`;

/** Filas del desglose (concepto + precio). Oculta costo/margen. */
function renderDesglose(desglose = []) {
  return (desglose || [])
    .filter((d) => (Number(d.precio) || 0) !== 0)
    .map((d) => `
      <tr>
        <td style="padding:5px 0;color:#540027;font-size:0.9rem;">${d.concepto}</td>
        <td style="padding:5px 0;text-align:right;color:#540027;font-weight:600;font-size:0.9rem;">${money(d.precio)}</td>
      </tr>`)
    .join("");
}

function bloqueEntregaHtml(pedido, forAdmin = false) {
  const fechaTxt = formatearFechaLarga(pedido.fecha);
  const horaTxt = pedido.envio?.hora ? ` · ${pedido.envio.hora} hrs` : "";
  const esDomicilio = pedido.envio?.tipo === "domicilio";
  if (esDomicilio) {
    return `
      <p style="margin:0 0 4px;color:#a78891;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">${forAdmin ? "🚚 " : ""}Entrega a domicilio</p>
      ${pedido.envio?.direccion ? `<p style="margin:0;color:#540027;line-height:1.6;">${pedido.envio.direccion}</p>` : ""}
      <p style="margin:0;color:#540027;line-height:1.6;">${pedido.envio?.colonia ? `Col. ${pedido.envio.colonia}, ` : ""}${pedido.envio?.municipio || ""}</p>
      ${pedido.envio?.zona ? `<p style="margin:0;color:#a78891;font-size:0.85rem;">Zona ${pedido.envio.zona}</p>` : ""}
      <p style="margin:6px 0 0;font-weight:700;color:#540027;">${fechaTxt}${horaTxt}</p>`;
  }
  return `
    <p style="margin:0 0 4px;color:#a78891;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">${forAdmin ? "🏪 " : ""}Recoger en sucursal</p>
    <p style="margin:0;color:#540027;line-height:1.6;">${STORE_ADDRESS}</p>
    <p style="margin:6px 0 0;font-weight:700;color:#540027;">${fechaTxt}${horaTxt}</p>`;
}

function bloqueTotales(pedido) {
  const saldo = Number(pedido.saldoPendiente) || 0;
  const anticipo = Number(pedido.anticipo) || 0;
  return `
    <table style="width:100%;border-collapse:collapse;margin-top:14px;">
      ${renderDesglose(pedido.desglose)}
      ${Number(pedido.envio?.costo) > 0 ? `<tr><td style="padding:5px 0;color:#a78891;">Envío</td><td style="padding:5px 0;text-align:right;color:#540027;font-weight:600;">${money(pedido.envio.costo)}</td></tr>` : ""}
      <tr><td style="padding:8px 0;border-top:2px solid #ffe2e7;color:#540027;font-weight:800;">Total</td><td style="padding:8px 0;border-top:2px solid #ffe2e7;text-align:right;color:#540027;font-weight:800;font-size:1.15rem;">${money(pedido.total)}</td></tr>
      ${anticipo > 0 ? `<tr><td style="padding:4px 0;color:#1D5A45;">Anticipo pagado</td><td style="padding:4px 0;text-align:right;color:#1D5A45;font-weight:700;">${money(anticipo)}</td></tr>` : ""}
      ${saldo > 0 ? `<tr><td style="padding:4px 0;color:#B23A48;font-weight:700;">Saldo pendiente</td><td style="padding:4px 0;text-align:right;color:#B23A48;font-weight:800;">${money(saldo)}</td></tr>` : ""}
    </table>`;
}

/** Confirmación al cliente. */
async function sendVintageConfirmation(pedido) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("[vintageEmails] EMAIL_USER/EMAIL_PASS no configurados — no se envía email");
    return;
  }
  if (!pedido.cliente?.email) {
    console.warn(`[vintageEmails] pedido ${pedido.numeroOrden} sin email de cliente — no se envía`);
    return;
  }
  const transporter = buildTransporter();
  const saldo = Number(pedido.saldoPendiente) || 0;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #ffe2e7;border-radius:14px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#FFC3C9,#FFA1AA);padding:28px 24px;text-align:center;">
        <p style="margin:0 0 4px;color:#fff;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;">Pastel Vintage</p>
        <h1 style="margin:0;color:#fff;font-size:1.7rem;">${saldo > 0 ? "¡Tu pastel está agendado!" : "¡Pago confirmado!"}</h1>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 8px;color:#540027;line-height:1.6;">Hola <strong>${pedido.cliente.nombre}</strong>,</p>
        <p style="margin:0 0 18px;color:#540027;line-height:1.6;">${saldo > 0
          ? "Recibimos tu anticipo y tu Pastel Vintage quedó agendado. Aquí están los detalles:"
          : "¡Gracias! Tu Pastel Vintage está pagado y agendado. Aquí están los detalles:"}</p>

        <div style="background:#fff1f2;border-left:4px solid #FF6F7D;border-radius:8px;padding:14px 16px;margin-bottom:18px;">
          <p style="margin:0;color:#a78891;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">Número de orden</p>
          <p style="margin:4px 0 0;font-size:1.4rem;font-weight:800;color:#540027;font-family:'Courier New',monospace;letter-spacing:0.04em;">${pedido.numeroOrden || "—"}</p>
        </div>

        <h3 style="color:#540027;font-size:1rem;margin:0 0 6px;">Tu pastel</h3>
        ${bloqueTotales(pedido)}

        <h3 style="color:#540027;font-size:1rem;margin:24px 0 10px;">Entrega</h3>
        <div style="background:#fff;border:1px solid #ffe2e7;border-radius:10px;padding:14px 16px;margin-bottom:18px;">
          ${bloqueEntregaHtml(pedido)}
        </div>

        ${pedido.notas ? `<div style="background:#FFE99B;border-radius:8px;padding:10px 14px;margin-bottom:18px;"><p style="margin:0;color:#6B4F1A;font-size:0.85rem;"><strong>Nota:</strong> ${pedido.notas}</p></div>` : ""}

        ${saldo > 0 ? `<div style="background:#fff;border:1px solid #F3C0C6;border-radius:10px;padding:12px 16px;margin-bottom:18px;"><p style="margin:0;color:#B23A48;font-size:0.88rem;line-height:1.6;">Recuerda que queda un <strong>saldo pendiente de ${money(saldo)}</strong>, a liquidar antes de la entrega.</p></div>` : ""}

        <div style="text-align:center;margin:24px 0 8px;">
          <a href="${WHATSAPP_LINK}?text=${encodeURIComponent(`Hola, mi número de orden Vintage es ${pedido.numeroOrden}`)}" style="display:inline-block;padding:12px 26px;background:#25D366;color:#fff;text-decoration:none;border-radius:999px;font-weight:700;font-size:0.9rem;">💬 Contactar por WhatsApp</a>
        </div>
        <p style="margin:18px 0 0;color:#a78891;font-size:0.78rem;text-align:center;line-height:1.6;">Pastelería El Ruiseñor · ${STORE_ADDRESS}</p>
      </div>
    </div>`;

  await transporter.sendMail({
    from: `"Pastelería El Ruiseñor" <${process.env.EMAIL_USER}>`,
    to: pedido.cliente.email,
    subject: `Pastel Vintage agendado · ${pedido.numeroOrden || ""}`.trim(),
    html,
  });
  console.log(`[vintageEmails] confirmación enviada a ${pedido.cliente.email} (${pedido.numeroOrden})`);
}

/** Aviso al admin. */
async function sendVintageConfirmationToAdmin(pedido) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
  const transporter = buildTransporter();

  const dashboardLink = process.env.FRONT_DOMAIN
    ? `${process.env.FRONT_DOMAIN.replace(/\/$/, "")}/dashboard/pedidos-vintage/${pedido._id}`
    : null;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #ffe2e7;border-radius:14px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#540027,#7A1F44);padding:24px;text-align:center;">
        <p style="margin:0 0 4px;color:#FFC3C9;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;">🎀 Pastel Vintage · Nuevo pedido</p>
        <h1 style="margin:0;color:#fff;font-size:1.6rem;">Agendado · ${money(pedido.total)}</h1>
      </div>
      <div style="padding:24px;">
        <div style="background:#fff1f2;border-left:4px solid #FF6F7D;border-radius:8px;padding:14px 16px;margin-bottom:18px;">
          <p style="margin:0;color:#a78891;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">Número de orden</p>
          <p style="margin:4px 0 0;font-size:1.4rem;font-weight:800;color:#540027;font-family:'Courier New',monospace;">${pedido.numeroOrden || "—"}</p>
        </div>

        <h3 style="color:#540027;font-size:1rem;margin:0 0 10px;">Cliente</h3>
        <div style="background:#fff;border:1px solid #ffe2e7;border-radius:10px;padding:14px 16px;margin-bottom:18px;">
          <p style="margin:0 0 4px;color:#540027;font-weight:700;font-size:1.05rem;">${pedido.cliente?.nombre || ""}</p>
          <p style="margin:0;color:#540027;line-height:1.7;font-size:0.9rem;">📞 <a href="tel:${pedido.cliente?.telefono || ""}" style="color:#540027;text-decoration:none;">${pedido.cliente?.telefono || ""}</a></p>
          ${pedido.cliente?.email ? `<p style="margin:0;color:#540027;line-height:1.7;font-size:0.9rem;">✉️ <a href="mailto:${pedido.cliente.email}" style="color:#540027;text-decoration:none;">${pedido.cliente.email}</a></p>` : ""}
        </div>

        <h3 style="color:#540027;font-size:1rem;margin:0 0 6px;">Detalle</h3>
        ${bloqueTotales(pedido)}

        <h3 style="color:#540027;font-size:1rem;margin:24px 0 10px;">Entrega</h3>
        <div style="background:#fff;border:1px solid #ffe2e7;border-radius:10px;padding:14px 16px;margin-bottom:18px;">
          ${bloqueEntregaHtml(pedido, true)}
        </div>

        ${pedido.notas ? `<div style="background:#FFE99B;border-radius:8px;padding:10px 14px;margin-bottom:18px;"><p style="margin:0;color:#6B4F1A;font-size:0.85rem;"><strong>Nota del cliente:</strong> ${pedido.notas}</p></div>` : ""}

        ${dashboardLink ? `<div style="text-align:center;margin:24px 0 8px;"><a href="${dashboardLink}" style="display:inline-block;padding:12px 26px;background:#540027;color:#fff;text-decoration:none;border-radius:999px;font-weight:700;font-size:0.9rem;">Ver pedido en el dashboard →</a></div>` : ""}
      </div>
    </div>`;

  await transporter.sendMail({
    from: `"Pastelería El Ruiseñor" <${process.env.EMAIL_USER}>`,
    to: adminEmail,
    subject: `🎀 Vintage agendado · ${pedido.numeroOrden || ""} · ${money(pedido.total)}`.trim(),
    html,
  });
  console.log(`[vintageEmails] aviso admin enviado (${pedido.numeroOrden})`);
}

module.exports = { sendVintageConfirmation, sendVintageConfirmationToAdmin };
