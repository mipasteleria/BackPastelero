#!/usr/bin/env node
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/users");

function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function usage(msg) {
  if (msg) console.error("\nError:", msg, "\n");
  console.error(
    [
      "Uso:",
      "  node scripts/seed-admin.js \\",
      "    --email=admin@ruisenor.mx \\",
      "    --password='ContraseñaFuerte123!' \\",
      "    --name=Ani \\",
      "    --lastname=Melendrez \\",
      "    --phone=555-555-5555",
      "",
      "Si el email ya existe, se actualiza role=admin y opcionalmente la password.",
      "",
    ].join("\n")
  );
  process.exit(1);
}

(async () => {
  const args = parseArgs(process.argv);
  const required = ["email", "password", "name", "lastname", "phone"];
  const missing = required.filter((k) => !args[k]);
  if (missing.length) usage(`faltan args: ${missing.join(", ")}`);

  if (!process.env.MONGO_URL) usage("MONGO_URL no está definida en .env");

  await mongoose.connect(process.env.MONGO_URL);
  console.log("Conectado a MongoDB");

  const email = args.email.toLowerCase().trim();
  const existing = await User.findOne({ email });
  const hash = await User.encryptPassword(args.password);

  if (existing) {
    existing.role = "admin";
    existing.password = hash;
    await existing.save();
    console.log(`Usuario existente actualizado a admin: ${email}`);
  } else {
    await User.create({
      name: args.name,
      lastname: args.lastname,
      email,
      password: hash,
      phone: args.phone,
      role: "admin",
    });
    console.log(`Admin creado: ${email}`);
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error("Falló el seed:", err.message);
  process.exit(1);
});
