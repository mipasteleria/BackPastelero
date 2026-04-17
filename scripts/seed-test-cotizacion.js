#!/usr/bin/env node
/**
 * Inserta una cotización de prueba con status "Agendado con el 50%" y
 * deliveryDate en 3 días, para verificar el formato de fecha y probar el cron.
 *
 * Uso:
 *   node scripts/seed-test-cotizacion.js
 *
 * Opciones:
 *   --days=N   días de entrega desde hoy (default: 3)
 *   --format=dd/mm/yyyy | mm/dd/yyyy | yyyy-mm-dd  (default: dd/mm/yyyy)
 *   --clean    eliminar la cotización de prueba recién creada
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Pastel = require("../src/models/pastelCotiza");

function parseArgs(argv) {
  const out = { days: 3, format: "dd/mm/yyyy", clean: false };
  for (const arg of argv.slice(2)) {
    if (arg === "--clean") { out.clean = true; continue; }
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  out.days = Number(out.days);
  return out;
}

function formatDate(date, fmt) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  switch (fmt) {
    case "mm/dd/yyyy": return `${mm}/${dd}/${yyyy}`;
    case "yyyy-mm-dd": return `${yyyy}-${mm}-${dd}`;
    default:           return `${dd}/${mm}/${yyyy}`;   // dd/mm/yyyy
  }
}

(async () => {
  if (!process.env.MONGO_URL) {
    console.error("MONGO_URL no está definida en .env");
    process.exit(1);
  }

  const args = parseArgs(process.argv);
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Conectado a MongoDB\n");

  if (args.clean) {
    const result = await Pastel.deleteMany({ contactName: "TEST - Borrar" });
    console.log(`Eliminadas ${result.deletedCount} cotizaciones de prueba.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + args.days);
  const deliveryDateStr = formatDate(deliveryDate, args.format);

  const cotizacion = await Pastel.create({
    flavor: "Vainilla",
    levels: "2",
    portions: "20",
    contactName: "TEST - Borrar",
    contactPhone: "555-555-5555",
    deliveryDate: deliveryDateStr,
    precio: 1200,
    anticipo: 600,
    saldoPendiente: 600,
    status: "Agendado con el 50%",
    userId: "test-user-id",
    questionsOrComments: "Cotización de prueba para verificar cron. Borrar después.",
  });

  console.log("✅ Cotización de prueba creada:");
  console.log("   _id:          ", cotizacion._id.toString());
  console.log("   status:       ", cotizacion.status);
  console.log("   deliveryDate: ", cotizacion.deliveryDate, " ← formato almacenado");
  console.log("   saldoPendiente:", cotizacion.saldoPendiente);
  console.log("   reminderSentAt:", cotizacion.reminderSentAt);
  console.log("\nPara eliminarla después:");
  console.log("  node scripts/seed-test-cotizacion.js --clean\n");

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
