const express = require("express");
const router = express.Router();
const GalletaSabor = require("../models/galletaSabor");
const Receta = require("../models/recetas/recetas");
const Cost = require("../models/costs");
const Notificacion = require("../models/notificaciones");
const checkRoleToken = require("../middlewares/myRoleToken");

/**
 * Rutas de Sabores de Galleta NY.
 *
 * Lectura pública (la página `/enduser/galletas-ny` necesita ver el
 * catálogo sin autenticación). Mutaciones solo admin.
 */

// ── Helpers de costeo ───────────────────────────────────────────────

/**
 * Lee la config global de costeo de galletas. Si no existe documento
 * `Cost`, devuelve defaults seguros para que el cálculo no falle al
 * principio (cuando el admin no ha capturado nada todavía).
 */
async function getGalletaCostConfig() {
  const cfg = await Cost.findOne();
  return {
    costoBranding:  cfg?.costoBrandingPorGalleta ?? 0,
    markupPct:      cfg?.markupGalletasPct ?? 60,
    margenMinimo:   cfg?.margenMinimoGalleta ?? 5,
  };
}

/**
 * Costo "live" por galleta a partir de la receta + config global.
 * Devuelve null si no se puede calcular (sin receta o sin porciones).
 */
function calcularCostoLive(receta, costoBranding) {
  if (!receta || !receta.portions || receta.portions <= 0) return null;
  if (typeof receta.total_cost !== "number") return null;
  const costoMP = receta.total_cost / receta.portions;
  return Math.round((costoMP + costoBranding) * 100) / 100;
}

/**
 * Crea una notificación de margen bajo si no hay otra reciente (30 días)
 * para el mismo sabor. Idempotente: evita spamear al admin.
 */
async function notificarMargenBajoSiCorresponde(sabor, margenActual, margenMinimo) {
  const treintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const yaNotificado = await Notificacion.findOne({
    mensaje: { $regex: `Margen bajo · ${sabor.slug}`, $options: "i" },
    fecha: { $gte: treintaDiasAtras },
  });
  if (yaNotificado) return;

  await Notificacion.create({
    mensaje: `⚠️ Margen bajo · ${sabor.nombre} (${sabor.slug}): margen actual $${margenActual.toFixed(2)} (mínimo $${margenMinimo}). Considera recostear o subir precio.`,
    userId: "admin",
  });
}

// ── GET /galletaSabores — listar sabores ────────────────────────────
// Público. Por defecto solo devuelve activos. Admin puede pasar ?todos=true.
// Si ?conMargen=true se calcula `costoLive`, `margenActual` y
// `alertaMargenBajo` para cada sabor con receta — solo recomendable
// para el listado del admin (requiere JOIN con recetas y config).
router.get("/", async (req, res) => {
  try {
    const filter = req.query.todos === "true" ? {} : { activo: true };
    const sabores = await GalletaSabor.find(filter).sort({ orden: 1, createdAt: 1 });

    if (req.query.conMargen !== "true") {
      return res.json({ message: "Sabores de galleta", data: sabores });
    }

    // Modo admin con vigilancia de margen.
    const { costoBranding, margenMinimo } = await getGalletaCostConfig();
    const recetaIds = [...new Set(sabores.map(s => s.recetaId).filter(Boolean).map(String))];
    const recetas = recetaIds.length
      ? await Receta.find({ _id: { $in: recetaIds } }).select("nombre_receta total_cost portions")
      : [];
    const recetaMap = new Map(recetas.map(r => [String(r._id), r]));

    const enriched = await Promise.all(sabores.map(async (s) => {
      const obj = s.toObject({ virtuals: true });
      if (!s.recetaId) return obj;
      const receta = recetaMap.get(String(s.recetaId));
      const costoLive = calcularCostoLive(receta, costoBranding);
      if (costoLive == null) return obj;
      const margenActual = Math.round((s.precio - costoLive) * 100) / 100;
      const alerta = margenActual < margenMinimo;
      if (alerta) {
        // Side-effect: notifica al admin (idempotente). No bloqueamos
        // la respuesta si esto falla.
        notificarMargenBajoSiCorresponde(s, margenActual, margenMinimo).catch(e =>
          console.error("[galletaSabores] error creando notificación margen bajo:", e.message)
        );
      }
      return { ...obj, costoLive, margenActual, alertaMargenBajo: alerta };
    }));

    res.json({ message: "Sabores de galleta", data: enriched });
  } catch (error) {
    console.error("Error listando sabores galletas:", error);
    res.status(500).json({ message: error.message });
  }
});

// ── POST /galletaSabores/calcular-precio (admin) ────────────────────
// Devuelve un breakdown sugerido para un sabor a partir de una receta
// + la config global de branding y markup. NO modifica nada.
// Body: { recetaId, markupPct? }
router.post("/calcular-precio", checkRoleToken("admin"), async (req, res) => {
  try {
    const { recetaId, markupPct } = req.body || {};
    if (!recetaId) return res.status(400).json({ message: "recetaId es requerido" });

    const receta = await Receta.findById(recetaId);
    if (!receta) return res.status(404).json({ message: "Receta no encontrada" });
    if (!receta.portions || receta.portions <= 0) {
      return res.status(400).json({ message: "La receta no tiene `portions` válido" });
    }

    const { costoBranding, markupPct: markupDefault } = await getGalletaCostConfig();
    const markup = typeof markupPct === "number" && markupPct >= 0 ? markupPct : markupDefault;

    const costoMateriaPrima = Math.round((receta.total_cost / receta.portions) * 100) / 100;
    const costoTotal = Math.round((costoMateriaPrima + costoBranding) * 100) / 100;
    const precioSugerido = Math.round(costoTotal * (1 + markup / 100) * 100) / 100;

    res.json({
      message: "Precio calculado",
      data: {
        receta: { _id: receta._id, nombre_receta: receta.nombre_receta, portions: receta.portions, total_cost: receta.total_cost },
        costoMateriaPrima,
        costoBranding,
        costoTotal,
        markupPct: markup,
        precioSugerido,
      },
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── GET /galletaSabores/:id ─────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const sabor = await GalletaSabor.findById(req.params.id);
    if (!sabor) return res.status(404).json({ message: "Sabor no encontrado" });
    res.json({ message: "Sabor", data: sabor });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── POST /galletaSabores — crear sabor (admin) ──────────────────────
// Toma slug, nombre, precio, stock inicial y opcionalmente imagen/tags.
// Opcionalmente acepta `recetaId` — si está, el sistema congela el
// costo unitario actual de esa receta como `costoUnitarioSnapshot`.
// El admin puede haber visto el precio sugerido vía `/calcular-precio`
// y ajustar `precio` antes de mandar el POST.
router.post("/", checkRoleToken("admin"), async (req, res) => {
  try {
    const {
      slug, nombre, descripcion, precio, stock,
      imagen, emoji, bg, tag, tagColor, tagText,
      esTemporada, activo, orden,
      recetaId,
    } = req.body;

    if (!slug || !nombre || precio == null) {
      return res.status(400).json({ message: "slug, nombre y precio son requeridos" });
    }

    let costoUnitarioSnapshot = null;
    let fechaCosteoSnapshot = null;
    if (recetaId) {
      const receta = await Receta.findById(recetaId);
      if (!receta) return res.status(404).json({ message: "Receta no encontrada" });
      const { costoBranding } = await getGalletaCostConfig();
      const live = calcularCostoLive(receta, costoBranding);
      if (live != null) {
        costoUnitarioSnapshot = live;
        fechaCosteoSnapshot = new Date();
      }
    }

    const sabor = await GalletaSabor.create({
      slug:        String(slug).toLowerCase().trim(),
      nombre,
      descripcion: descripcion || "",
      precio:      Number(precio),
      stock:       Number(stock) || 0,
      imagen:      imagen || "",
      emoji:       emoji || "🍪",
      bg:          bg || "linear-gradient(135deg,#FFE2E7,#FFC3C9)",
      tag:         tag || "",
      tagColor:    tagColor || "",
      tagText:     tagText || "",
      esTemporada: !!esTemporada,
      activo:      activo !== false,
      orden:       Number(orden) || 0,
      recetaId:    recetaId || null,
      costoUnitarioSnapshot,
      fechaCosteoSnapshot,
    });

    res.status(201).json({ message: "Sabor creado", data: sabor });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Ya existe un sabor con ese slug" });
    }
    res.status(400).json({ message: error.message });
  }
});

// ── POST /galletaSabores/:id/recostear (admin) ──────────────────────
// Refresca el snapshot del sabor con el costo "live" actual de su
// receta. Útil cuando suben los precios de insumos y el admin quiere
// reflejar el nuevo costo (sin tocar el precio mostrado al cliente —
// eso lo decide el admin aparte).
router.post("/:id/recostear", checkRoleToken("admin"), async (req, res) => {
  try {
    const sabor = await GalletaSabor.findById(req.params.id);
    if (!sabor) return res.status(404).json({ message: "Sabor no encontrado" });
    if (!sabor.recetaId) {
      return res.status(400).json({ message: "Este sabor no tiene receta asociada — no se puede recostear" });
    }

    const receta = await Receta.findById(sabor.recetaId);
    if (!receta) return res.status(404).json({ message: "Receta asociada no encontrada" });

    const { costoBranding } = await getGalletaCostConfig();
    const live = calcularCostoLive(receta, costoBranding);
    if (live == null) {
      return res.status(400).json({ message: "No se pudo calcular el costo (receta sin porciones o total_cost)" });
    }

    sabor.costoUnitarioSnapshot = live;
    sabor.fechaCosteoSnapshot = new Date();
    await sabor.save();

    res.json({ message: "Costo del sabor actualizado", data: sabor });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── PUT /galletaSabores/:id — actualizar (admin) ────────────────────
// Permite tocar todos los campos. Si quieres SOLO ajustar stock, usa el
// endpoint dedicado /:id/stock — es seguro contra race conditions.
router.put("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    // Bloqueamos cambio directo de slug post-creación (rompería historial).
    const { slug: _ignore, ...payload } = req.body;
    const sabor = await GalletaSabor.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!sabor) return res.status(404).json({ message: "Sabor no encontrado" });
    res.json({ message: "Sabor actualizado", data: sabor });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── PATCH /galletaSabores/:id/stock — ajustar stock atómicamente ────
// Body: { delta: +25 } para sumar, { delta: -3 } para restar, o
//       { stock: 50 } para fijar valor absoluto.
// Atómico: usa $inc o $set sin race conditions.
router.patch("/:id/stock", checkRoleToken("admin"), async (req, res) => {
  try {
    const { delta, stock } = req.body || {};
    let update;

    if (typeof delta === "number") {
      update = { $inc: { stock: delta } };
    } else if (typeof stock === "number" && stock >= 0) {
      update = { $set: { stock } };
    } else {
      return res.status(400).json({ message: "Envía { delta: number } o { stock: number >= 0 }" });
    }

    const sabor = await GalletaSabor.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!sabor) return res.status(404).json({ message: "Sabor no encontrado" });

    // Si por error se permitió bajar a negativo, lo corregimos a 0.
    if (sabor.stock < 0) {
      sabor.stock = 0;
      await sabor.save();
    }

    res.json({ message: "Stock actualizado", data: sabor });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── DELETE /galletaSabores/:id — soft-delete (admin) ────────────────
// Por defecto hace soft-delete (activo=false). Para borrado físico
// pasar ?force=true.
router.delete("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    if (req.query.force === "true") {
      await GalletaSabor.findByIdAndDelete(req.params.id);
      return res.json({ message: "Sabor eliminado permanentemente" });
    }
    const sabor = await GalletaSabor.findByIdAndUpdate(
      req.params.id,
      { activo: false },
      { new: true }
    );
    if (!sabor) return res.status(404).json({ message: "Sabor no encontrado" });
    res.json({ message: "Sabor desactivado", data: sabor });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
