const express = require("express");
const router = express.Router();
const Insumos = require("../models/insumos");
const Receta = require("../models/recetas/recetas");
const checkRoleToken = require("../middlewares/myRoleToken");
const { normalizeName } = require("../utils/normalizeName");

/**
 * Busca un insumo existente con nombre normalizado equivalente al dado.
 *
 * Maneja entries LEGACY que no tienen el campo `nameNormalized` poblado
 * (creadas antes de que existiera el hook): si encuentra alguna sin el
 * campo, normaliza en JS, compara, y de paso aprovecha para reparar
 * (backfill) en background — así el siguiente POST corre rápido por el
 * índice.
 *
 * @param {string} name        nombre crudo a comparar
 * @param {string|null} excludeId  id de un insumo a excluir (para PUT)
 * @returns {Promise<Insumos|null>}
 */
async function findDuplicateByName(name, excludeId = null) {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  // Path rápido: lookup directo por nameNormalized (índice).
  let query = { nameNormalized: normalized };
  if (excludeId) query._id = { $ne: excludeId };
  const fast = await Insumos.findOne(query);
  if (fast) return fast;

  // Path lento: entries legacy sin nameNormalized. Para una colección
  // pequeña (pastelería) el costo es trivial. Normalizamos en JS.
  query = { $or: [{ nameNormalized: { $exists: false } }, { nameNormalized: null }, { nameNormalized: "" }] };
  if (excludeId) query._id = { $ne: excludeId };
  const legacy = await Insumos.find(query);
  if (!legacy.length) return null;

  // Aprovechamos para reparar el backfill en background (no bloquea
  // la respuesta al cliente).
  Promise.all(
    legacy.map(i =>
      Insumos.updateOne({ _id: i._id }, { $set: { nameNormalized: normalizeName(i.name) } })
    )
  ).catch(e => console.error("[insumos] backfill nameNormalized error:", e.message));

  return legacy.find(i => normalizeName(i.name) === normalized) || null;
}

// Enviar Insumo (POST) — solo admin
// Antes de crear, valida que no exista otro insumo con nombre equivalente
// (case/accent-insensitive). Si lo hay, responde 409 Conflict con el
// insumo existente para que el front pueda ofrecer "usar éste" en vez
// de pisar al admin con un duplicado silencioso.
router.post("/", checkRoleToken("admin"), async (req, res) => {
  try {
    const insumo = req.body || {};
    if (typeof insumo.name === "string" && insumo.name.trim()) {
      const existente = await findDuplicateByName(insumo.name);
      if (existente) {
        return res.status(409).send({
          message: `Ya existe un insumo con ese nombre: "${existente.name}"`,
          existente,
        });
      }
    }
    const newInsumo = await Insumos.create(insumo);
    res.status(201).send({ message: "Insumo created", data: newInsumo });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// Buscar insumos similares por nombre — útil en autocomplete del form.
// Normaliza la query y devuelve hasta 5 matches por substring sobre
// `nameNormalized`. Devuelve siempre 200 (lista vacía si no hay match).
// No requiere autenticación porque solo lee; si más adelante hay info
// sensible en insumos, agregar checkRoleToken.
router.get("/buscar-similares", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(200).send({ data: [] });
    const normalized = normalizeName(q);
    if (!normalized) return res.status(200).send({ data: [] });
    // Escapar caracteres especiales de regex (ej: paréntesis, +, etc.)
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = await Insumos.find({
      nameNormalized: { $regex: escaped, $options: "i" },
    })
      .limit(5)
      .sort({ nameNormalized: 1 });
    res.status(200).send({ data: matches });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// Obtener todos los Insumos (GET)
router.get("/", async (req, res) => {
  try {
    const insumos = await Insumos.find(); // Obtener todos los documentos
    res.status(200).send(insumos);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

router.get("/nombres", async (req, res) => {
  try {
    // Obtener solo los nombres de los documentos
    const nombres = await Insumos.find({}, "name"); // Obtener solo el campo 'name'
    res.status(200).send(nombres.map((insumo) => insumo.name));
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// Obtener un Insumo por ID (GET)
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const insumo = await Insumos.findById(id);
    if (!insumo) {
      return res.status(404).send({ message: "Insumo not found" });
    }
    res.status(200).send(insumo);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// Actualizar un Insumo (PUT) — solo admin
// Tras actualizar, recalcula automáticamente el precio en todas las recetas
// que referencian este insumo mediante insumoId.
// Si el body cambia el `name`, antes valida que no choque con otro insumo
// existente (excluyendo el propio :id). Si choca → 409.
router.put("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    if (typeof req.body?.name === "string" && req.body.name.trim()) {
      const choque = await findDuplicateByName(req.body.name, id);
      if (choque) {
        return res.status(409).send({
          message: `Ya existe otro insumo con ese nombre: "${choque.name}"`,
          existente: choque,
        });
      }
    }
    const updatedInsumo = await Insumos.findByIdAndUpdate(id, req.body, { new: true });
    if (!updatedInsumo) return res.status(404).send({ message: "Insumo not found" });

    // Propagar nuevo precio a todas las recetas que usen este insumo
    const unitCost = updatedInsumo.cost / (updatedInsumo.amount || 1);
    const recetas = await Receta.find({ "ingredientes.insumoId": id });

    await Promise.all(recetas.map(async (receta) => {
      receta.ingredientes.forEach((ing) => {
        if (ing.insumoId?.toString() === id) {
          ing.precio = Math.round(unitCost * ing.cantidad * 100) / 100;
          ing.total  = Math.round(unitCost * 100) / 100;
        }
      });
      const ingTotal = receta.ingredientes.reduce((s, i) => s + (i.precio || 0), 0);
      const rawCost  = ingTotal + (receta.additional_costs || 0);
      receta.total_cost = Math.round((rawCost + rawCost * (receta.special_tax || 0) / 100) * 100) / 100;
      await receta.save();
    }));

    res.status(200).send({
      message: "Insumo updated",
      data: updatedInsumo,
      recetasActualizadas: recetas.length,
    });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// POST /insumos/merge — fusionar duplicados manualmente — solo admin.
// Body: { canonicalId: "...", duplicateIds: ["...", "..."] }
//
// Para cada insumo en duplicateIds:
//   1) Encuentra recetas que referencian `ingredientes.insumoId`.
//   2) Reescribe la referencia al `canonicalId`.
//   3) Recalcula `total_cost` de la receta (porque el insumo canónico
//      puede tener costo/cantidad distintos).
//   4) Borra el duplicado.
//
// El canonicalId no se modifica.
// Idéntica lógica que el script CLI scripts/dedupe-insumos.js pero
// expuesta vía API para que el admin la dispare desde el dashboard.
router.post("/merge", checkRoleToken("admin"), async (req, res) => {
  try {
    const { canonicalId, duplicateIds } = req.body || {};
    if (!canonicalId || !Array.isArray(duplicateIds) || duplicateIds.length === 0) {
      return res.status(400).send({ message: "Se requiere canonicalId y duplicateIds (array no vacío)" });
    }
    // Defensa: nunca eliminar el canonical, aunque venga en la lista.
    const dupIds = duplicateIds.filter(id => String(id) !== String(canonicalId));
    if (!dupIds.length) {
      return res.status(400).send({ message: "duplicateIds no puede incluir solo al canonical" });
    }

    const canonical = await Insumos.findById(canonicalId);
    if (!canonical) return res.status(404).send({ message: "Insumo canónico no encontrado" });

    const duplicates = await Insumos.find({ _id: { $in: dupIds } });
    if (duplicates.length === 0) {
      return res.status(404).send({ message: "Ninguno de los duplicados existe" });
    }
    const validDupIds = duplicates.map(d => d._id);

    // Reescribir referencias en recetas y recalcular total_cost
    const recetas = await Receta.find({ "ingredientes.insumoId": { $in: validDupIds } });
    const unitCost = canonical.cost / (canonical.amount || 1);

    for (const receta of recetas) {
      let touched = false;
      receta.ingredientes.forEach(ing => {
        if (ing.insumoId && validDupIds.some(id => String(id) === String(ing.insumoId))) {
          ing.insumoId = canonical._id;
          ing.precio = Math.round(unitCost * (ing.cantidad || 0) * 100) / 100;
          ing.total  = Math.round(unitCost * 100) / 100;
          touched = true;
        }
      });
      if (touched) {
        const ingTotal = receta.ingredientes.reduce((s, i) => s + (i.precio || 0), 0);
        const rawCost  = ingTotal + (receta.additional_costs || 0);
        receta.total_cost = Math.round((rawCost + rawCost * (receta.special_tax || 0) / 100) * 100) / 100;
        await receta.save();
      }
    }

    // Borrar duplicados
    await Insumos.deleteMany({ _id: { $in: validDupIds } });

    res.status(200).send({
      message: "Merge completado",
      data: {
        canonical,
        eliminados: validDupIds.length,
        recetasActualizadas: recetas.length,
      },
    });
  } catch (error) {
    console.error("Error en merge de insumos:", error);
    res.status(500).send({ message: error.message });
  }
});

// Eliminar un Insumo (DELETE) — solo admin
router.delete("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const deletedInsumo = await Insumos.findByIdAndDelete(id);
    if (!deletedInsumo) {
      return res.status(404).send({ message: "Insumo not found" });
    }
    res.status(200).send({ message: "Insumo deleted" });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

module.exports = router;
