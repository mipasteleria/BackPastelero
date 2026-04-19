const cron = require("node-cron");
const nodemailer = require("nodemailer");
const Pastel = require("../models/pastelCotiza");
const Cupcake = require("../models/cupcakesCotiza");
const Snack = require("../models/snackCotiza");
const User = require("../models/users");

// deliveryDate se almacena como String "DD/MM/YYYY" (ej. "20/04/2026")
function toDateString(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function buildTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

async function sendReminder(transporter, cotizacion, tipo) {
  let destinatario = cotizacion.email || cotizacion.contactEmail;

  // El email no se guarda en la cotización — lo buscamos en el User por userId
  if (!destinatario && cotizacion.userId) {
    const user = await User.findById(cotizacion.userId).select("email").lean();
    destinatario = user?.email;
  }

  if (!destinatario) {
    console.warn(
      `[reminderCron] ${tipo} ${cotizacion._id} sin email (userId: ${cotizacion.userId}) — omitido`
    );
    return false;
  }

  await transporter.sendMail({
    from: `Pastelería Ruiseñor <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: "Recordatorio: saldo pendiente de tu pedido 🎂",
    html: `
      <p>Hola <strong>${cotizacion.contactName}</strong>,</p>
      <p>Te recordamos que tu pedido de <strong>${tipo}</strong> tiene una
      entrega programada el <strong>${cotizacion.deliveryDate}</strong>
      y aún queda un saldo pendiente de
      <strong>$${cotizacion.saldoPendiente} MXN</strong>.</p>
      <p>Por favor liquida tu saldo antes de la fecha de entrega para confirmar
      tu pedido. Puedes hacerlo desde la sección <em>Mis Pedidos</em> en
      nuestra página.</p>
      <p>¡Gracias por confiar en Pastelería Ruiseñor! 🌸</p>
    `,
  });

  return true;
}

async function runReminders() {
  const today = new Date();
  const in3 = new Date(today); in3.setDate(today.getDate() + 3);
  const in4 = new Date(today); in4.setDate(today.getDate() + 4);
  const targetDates = [toDateString(in3), toDateString(in4)];

  console.log(`[reminderCron] Buscando entregas en: ${targetDates.join(", ")}`);

  // deliveryDate puede ser "DD/MM/YYYY" (seed) o "DD/MM/YYYY HH:MM" (form).
  // $regex con ancla "^" matchea ambos formatos.
  const query = {
    status: "Agendado con el 50%",
    reminderSentAt: null,
    $or: targetDates.map((d) => ({ deliveryDate: { $regex: new RegExp(`^${d}`) } })),
  };

  const [pasteles, cupcakes, snacks] = await Promise.all([
    Pastel.find(query),
    Cupcake.find(query),
    Snack.find(query),
  ]);

  const lotes = [
    { docs: pasteles, tipo: "Pastel" },
    { docs: cupcakes, tipo: "Cupcake" },
    { docs: snacks,   tipo: "Snack"  },
  ];

  const total = pasteles.length + cupcakes.length + snacks.length;
  if (total === 0) {
    console.log("[reminderCron] Sin recordatorios pendientes hoy.");
    return;
  }

  const transporter = buildTransporter();

  for (const { docs, tipo } of lotes) {
    for (const cotizacion of docs) {
      try {
        const enviado = await sendReminder(transporter, cotizacion, tipo);
        if (enviado) {
          await cotizacion.updateOne({ reminderSentAt: new Date() });
          console.log(
            `[reminderCron] Recordatorio enviado: ${tipo} ${cotizacion._id}`
          );
        }
      } catch (err) {
        // Logueamos pero no detenemos el loop — el próximo día reintentará
        // porque reminderSentAt sigue siendo null.
        console.error(
          `[reminderCron] Error enviando a ${cotizacion._id}:`,
          err.message
        );
      }
    }
  }
}

// Corre todos los días a las 09:00 hora del servidor
function startReminderCron() {
  cron.schedule("0 9 * * *", async () => {
    console.log("[reminderCron] Ejecutando revisión diaria...");
    try {
      await runReminders();
    } catch (err) {
      console.error("[reminderCron] Error inesperado:", err.message);
    }
  });

  console.log("[reminderCron] Cron de recordatorios registrado (09:00 diario)");
}

module.exports = { startReminderCron, runReminders };
