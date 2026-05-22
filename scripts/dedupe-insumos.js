#!/usr/bin/env node
require("dotenv").config();
const mongoose = require("mongoose");
const Insumos = require("../src/models/insumos");
const Receta = require("../src/models/recetas/recetas");
const { normalizeName } = require("../src/utils/normalizeName");

/**
 * Detecta y opcionalmente fusiona insumos duplicados por nombre normalizado.
 *
 * Sin flags es DRY-RUN: solo reporta los grupos de duplicados detectados.
 * Con `--apply` ejecuta la fusión:
 *   1. Elige un insumo canónico del grupo (por defecto el más antiguo).
 *   2. En todas las recetas que referencian a los otros duplicados,
 *      reescribe `ingredientes.insumoId` al canónico.
 *   3. Borra los duplicados.
 *
 * Criterio de canónico:
 *   --canonical=oldest   (default) el `createdAt` más viejo
 *   --canonical=newest   el `createdAt` más reciente
 *   --canonical=cheapest el de menor `cost` (útil si el precio histórico
 *                         es el "correcto" — usar con cuidado)
 *
 * Uso:
 *   node scripts/dedupe-insumos.js                  # dry-run, oldest
 *   node scripts/dedupe-insumos.js --apply           # aplica con oldest
 *   node scripts/dedupe-insumos.js --apply --canonical=newest
 *
 * IMPORTANTE: hacer backup de la DB antes de correr con --apply.
 * El script imprime el plan completo en dry-run para que puedas revisarlo.
 */

function parseArgs(argv) {
  const out = { apply: false, canonical: "oldest" };
  for (const arg of argv.slice(2)) {
    if (arg === "--apply") { out.apply = true; continue; }
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function pickCanonical(group, strategy) {
  const sorted = [...group];
  if (strategy === "newest") {
    sorted.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  } else if (strategy === "cheapest") {
    sorted.sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity));
  } else {
    // oldest (default)
    sorted.sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
  }
  return sorted[0];
}

async function main() {
  const args = parseArgs(process.argv);
  if (!process.env.MONGO_URL) {
    console.error("MONGO_URL no está definida en .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URL);
  console.log(`Conectado a Mongo. Modo: ${args.apply ? "APPLY" : "DRY-RUN"}. Canónico: ${args.canonical}`);

  // 1) Backfill: asegurar que todos los insumos tengan nameNormalized.
  // Solo escribimos a los que les falta — barato.
  const sinNorm = await Insumos.find({ $or: [{ nameNormalized: { $exists: false } }, { nameNormalized: "" }, { nameNormalized: null }] });
  if (sinNorm.length) {
    console.log(`\nBackfilling nameNormalized en ${sinNorm.length} insumos…`);
    for (const i of sinNorm) {
      i.nameNormalized = normalizeName(i.name);
      if (args.apply) await i.save();
    }
  }

  // 2) Detectar grupos duplicados.
  const all = await Insumos.find({}).sort({ createdAt: 1 });
  const groups = new Map();
  for (const i of all) {
    const key = i.nameNormalized || normalizeName(i.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  const dups = [...groups.entries()].filter(([, arr]) => arr.length > 1);

  if (!dups.length) {
    console.log("\n✅ No se detectaron duplicados.");
    await mongoose.disconnect();
    return;
  }

  console.log(`\n⚠️  ${dups.length} grupos de duplicados detectados:\n`);

  let totalAEliminar = 0;
  let totalRecetasAfectadas = 0;

  for (const [key, group] of dups) {
    const canonical = pickCanonical(group, args.canonical);
    const others = group.filter(i => String(i._id) !== String(canonical._id));
    const otherIds = others.map(i => i._id);

    // Recetas que referencian a los duplicados (no al canónico)
    const recetas = await Receta.find({ "ingredientes.insumoId": { $in: otherIds } });

    console.log(`▸ "${key}" (${group.length} duplicados):`);
    console.log(`   ✓ CANÓNICO: ${canonical._id} · "${canonical.name}" · $${canonical.cost} / ${canonical.amount} ${canonical.unit} · created ${canonical.createdAt?.toISOString().slice(0,10)}`);
    for (const o of others) {
      console.log(`   ✗ DUPLICADO: ${o._id} · "${o.name}" · $${o.cost} / ${o.amount} ${o.unit} · created ${o.createdAt?.toISOString().slice(0,10)}`);
    }
    if (recetas.length) {
      console.log(`   → ${recetas.length} receta(s) referencian a duplicado(s): ${recetas.map(r => r.nombre_receta).join(", ")}`);
    } else {
      console.log(`   → ninguna receta usa los duplicados (borrado limpio)`);
    }
    console.log("");

    totalAEliminar += others.length;
    totalRecetasAfectadas += recetas.length;

    if (args.apply) {
      // Reescribe referencias en recetas
      for (const receta of recetas) {
        receta.ingredientes.forEach(ing => {
          if (ing.insumoId && otherIds.some(id => String(id) === String(ing.insumoId))) {
            ing.insumoId = canonical._id;
          }
        });
        await receta.save();
      }
      // Borra duplicados
      await Insumos.deleteMany({ _id: { $in: otherIds } });
    }
  }

  console.log(`\nResumen:`);
  console.log(`  - Grupos con duplicados: ${dups.length}`);
  console.log(`  - Insumos a eliminar:    ${totalAEliminar}`);
  console.log(`  - Recetas a actualizar:  ${totalRecetasAfectadas}`);

  if (!args.apply) {
    console.log("\n💡 Esto fue DRY-RUN. Para aplicar:");
    console.log("   node scripts/dedupe-insumos.js --apply");
    console.log("   (o con --canonical=newest|cheapest si quieres otra estrategia)");
  } else {
    console.log("\n✅ Aplicado. Recetas y duplicados procesados.");
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error("Error:", err);
  mongoose.disconnect();
  process.exit(1);
});
