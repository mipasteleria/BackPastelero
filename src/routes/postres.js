const express = require("express");
const router = express.Router();
const { Storage } = require("@google-cloud/storage");
const Postre = require("../models/postre");
const Receta = require("../models/recetas/recetas");
const Cost = require("../models/costs");
const checkRoleToken = require("../middlewares/myRoleToken");

const MAX_DESTACADOS = 4;

function round2(n) { return Math.round(n * 100) / 100; }

/**
 * Calcula el desglose de precio sugerido para un postre, dada una
 * receta + empaque del postre + config global. Reusa el patrón de
 * galletaSabores.calcular-precio pero con empaque por postre.
 */
async function calcularDesglosePostre({ recetaId, costoEmpaque = 0, markupPctOverride } = {}) {
  const receta = await Receta.findById(recetaId);
  if (!receta) throw new Error("Receta no encontrada");
  if (!receta.portions || receta.portions <= 0) {
    throw new Error("La receta no tiene `portions` válido");
  }

  const cfg = await Cost.findOne();
  const costoBranding = cfg?.costoBrandingPorPostre ?? 0;
  const markupDefault = cfg?.markupPostresPct ?? 60;

  // Prioridad de markup: override del body > profit_margin de la receta > default global.
  let markup;
  if (typeof markupPctOverride === "number" && markupPctOverride >= 0) {
    markup = markupPctOverride;
  } else if (typeof receta.profit_margin === "number" && receta.profit_margin >= 0) {
    markup = receta.profit_margin;
  } else {
    markup = markupDefault;
  }

  const costoMateriaPrima = round2(receta.total_cost / receta.portions);
  const empaque = Number(costoEmpaque) || 0;
  const costoTotal = round2(costoMateriaPrima + costoBranding + empaque);
  const precioSugerido = round2(costoTotal * (1 + markup / 100));

  return {
    receta: {
      _id: receta._id,
      nombre_receta: receta.nombre_receta,
      portions: receta.portions,
      total_cost: receta.total_cost,
    },
    costoMateriaPrima,
    costoBranding,
    costoEmpaque: empaque,
    costoTotal,
    markupPct: markup,
    precioSugerido,
  };
}

// Cliente GCS local para borrar archivos huérfanos al reemplazar o
// eliminar postres (mismo patrón que homeConfig.js).
let gcs = null;
try {
  const credentials = process.env.GCS_CREDENTIALS ? JSON.parse(process.env.GCS_CREDENTIALS) : undefined;
  gcs = new Storage({ projectId: process.env.PROJECT_ID, credentials });
} catch (e) {
  console.error("[postres] GCS init failed — cleanup disabled:", e.message);
}
const BUCKET = process.env.BUCKET_NAME;

async function borrarArchivoGCS(fileName) {
  if (!gcs || !BUCKET || !fileName) return;
  try {
    await gcs.bucket(BUCKET).file(fileName).delete({ ignoreNotFound: true });
  } catch (e) {
    console.error(`[postres] No se pudo borrar archivo ${fileName}:`, e.message);
  }
}

// Whitelist de campos editables — evita que el cliente mande _id,
// createdAt, etc. en un POST/PUT y los sobrescriba.
const CAMPOS_EDITABLES = [
  "slug",
  "nombre",
  "descripcion",
  "precio",
  "imagenUrl",
  "imagenFileName",
  "activo",
  "destacado",
  "orden",
  "recetaId",
  "costoEmpaque",
];

function pickEditables(body) {
  const out = {};
  for (const k of CAMPOS_EDITABLES) {
    if (Object.prototype.hasOwnProperty.call(body || {}, k)) out[k] = body[k];
  }
  return out;
}

/**
 * GET /postres — listado.
 *
 * Público por default solo devuelve `activo: true`. Si el admin pasa
 * ?incluyeInactivos=true, devuelve todos (no validamos rol aquí porque
 * es una query opcional; si se filtra el catálogo público, no hay nada
 * que filtrar para inactivos).
 *
 * ?destacado=true filtra solo los destacados (atajo del home).
 */
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.incluyeInactivos !== "true") filter.activo = true;
    if (req.query.destacado === "true") filter.destacado = true;

    const postres = await Postre.find(filter).sort({ orden: 1, createdAt: -1 });
    res.json({ data: postres });
  } catch (e) {
    console.error("Error listando postres:", e);
    res.status(500).json({ message: e.message });
  }
});

/**
 * GET /postres/destacados — atajo público para el home.
 * Devuelve hasta 4 postres activos marcados como destacado.
 */
router.get("/destacados", async (req, res) => {
  try {
    const postres = await Postre.find({ activo: true, destacado: true })
      .sort({ orden: 1, createdAt: -1 })
      .limit(MAX_DESTACADOS);
    res.json({ data: postres });
  } catch (e) {
    console.error("Error obteniendo destacados:", e);
    res.status(500).json({ message: e.message });
  }
});

/**
 * POST /postres/calcular-precio — admin.
 *
 * Dado { recetaId, costoEmpaque, markupPct? }, devuelve un breakdown
 * del precio sugerido para un postre. NO modifica nada — solo calcula
 * en base a la receta y la config global. El admin decide si usa el
 * sugerido o setea `precio` manualmente al guardar el postre.
 *
 * Análogo a POST /galletaSabores/calcular-precio pero con empaque
 * variable por postre (no por catálogo global como branding).
 */
router.post("/calcular-precio", checkRoleToken("admin"), async (req, res) => {
  try {
    const { recetaId, costoEmpaque, markupPct } = req.body || {};
    if (!recetaId) return res.status(400).json({ message: "recetaId es requerido" });

    const data = await calcularDesglosePostre({
      recetaId,
      costoEmpaque,
      markupPctOverride: typeof markupPct === "number" ? markupPct : undefined,
    });
    res.json({ message: "Precio calculado", data });
  } catch (e) {
    console.error("Error calculando precio postre:", e);
    res.status(400).json({ message: e.message });
  }
});

/**
 * GET /postres/:idOrSlug — detalle.
 * Acepta ObjectId (admin) o slug (URLs públicas amigables).
 */
router.get("/:idOrSlug", async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(idOrSlug);
    const postre = isObjectId
      ? await Postre.findById(idOrSlug)
      : await Postre.findOne({ slug: idOrSlug });
    if (!postre) return res.status(404).json({ message: "Postre no encontrado" });
    res.json({ data: postre });
  } catch (e) {
    console.error("Error obteniendo postre:", e);
    res.status(500).json({ message: e.message });
  }
});

/**
 * POST /postres — admin: crear.
 * Si `destacado: true`, valida que no excedamos MAX_DESTACADOS.
 */
router.post("/", checkRoleToken("admin"), async (req, res) => {
  try {
    const data = pickEditables(req.body);

    if (data.destacado) {
      const count = await Postre.countDocuments({ destacado: true, activo: true });
      if (count >= MAX_DESTACADOS) {
        return res.status(400).json({
          message: `Ya hay ${MAX_DESTACADOS} postres destacados. Quita uno antes de marcar este.`,
        });
      }
    }

    const postre = await Postre.create(data);
    res.status(201).json({ message: "Postre creado", data: postre });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ message: "Ya existe un postre con ese slug" });
    }
    console.error("Error creando postre:", e);
    res.status(400).json({ message: e.message });
  }
});

/**
 * PUT /postres/:id — admin: editar.
 * Si la imagen cambia, borra el archivo previo de GCS.
 * Si se marca como destacado, valida MAX_DESTACADOS (excluyendo a sí mismo).
 */
router.put("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const previo = await Postre.findById(req.params.id);
    if (!previo) return res.status(404).json({ message: "Postre no encontrado" });

    const fileNamePrevio = previo.imagenFileName || "";
    const data = pickEditables(req.body);

    // Si se está marcando como destacado (y no lo era), validar tope.
    if (data.destacado === true && !previo.destacado) {
      const count = await Postre.countDocuments({
        destacado: true,
        activo: true,
        _id: { $ne: previo._id },
      });
      if (count >= MAX_DESTACADOS) {
        return res.status(400).json({
          message: `Ya hay ${MAX_DESTACADOS} postres destacados. Quita uno antes de marcar este.`,
        });
      }
    }

    Object.assign(previo, data);
    await previo.save();

    // Cleanup de imagen previa si fue reemplazada o limpiada.
    if (fileNamePrevio && fileNamePrevio !== previo.imagenFileName) {
      borrarArchivoGCS(fileNamePrevio); // fire-and-forget
    }

    res.json({ message: "Postre actualizado", data: previo });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ message: "Ya existe un postre con ese slug" });
    }
    console.error("Error actualizando postre:", e);
    res.status(400).json({ message: e.message });
  }
});

/**
 * DELETE /postres/:id — admin: borrar.
 * Hard-delete + cleanup de imagen en GCS.
 * Si se quiere conservar el postre para histórico, marcarlo activo:false en su lugar.
 */
router.delete("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const postre = await Postre.findByIdAndDelete(req.params.id);
    if (!postre) return res.status(404).json({ message: "Postre no encontrado" });
    if (postre.imagenFileName) borrarArchivoGCS(postre.imagenFileName);
    res.json({ message: "Postre eliminado" });
  } catch (e) {
    console.error("Error eliminando postre:", e);
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;
