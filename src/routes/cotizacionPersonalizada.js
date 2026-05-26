const express = require("express");
const router = express.Router();
const CotizacionPersonalizada = require("../models/cotizacionPersonalizada");
const SaborCotiza = require("../models/cotizacionCatalogos/sabor");
const RellenoCotiza = require("../models/cotizacionCatalogos/relleno");
const CoberturaCotiza = require("../models/cotizacionCatalogos/cobertura");
const DecoracionCotiza = require("../models/cotizacionCatalogos/decoracion");
const checkRoleToken = require("../middlewares/myRoleToken");
const { requireAuth } = checkRoleToken;
const { syncCotizacionCalendar } = require("../utils/cotizacionCalendarSync");
const { mountNotaInternaRoutes } = require("../utils/notaInternaRoute");

/**
 * Rutas para la cotización personalizada de pastel (rediseño 2026).
 *
 * Patrón:
 *  - POST público con payload nested (evento, sabor, relleno, etc.).
 *    El back resuelve los slugs de catálogo a snapshots y los congela.
 *  - GET admin = todo, GET user = solo suyas, GET por id = público pero
 *    sin notasInternas ni costeoSnapshot.
 *  - PUT solo admin.
 *  - Notas internas reusando mountNotaInternaRoutes.
 *  - Sync de Calendar al actualizar status.
 */

mountNotaInternaRoutes(router, CotizacionPersonalizada, "Cotización Personalizada");

// ── Helpers de resolución de slugs → snapshots ────────────────────

async function snapshotSabor(slug) {
  if (!slug) return null;
  const s = await SaborCotiza.findOne({ slug, activo: true });
  if (!s) return null;
  return {
    catalogoId: s._id,
    slug: s.slug,
    nombre: s.nombre,
    costoSnapshot: s.costoUnitarioSnapshot ?? s.costoManualPorPorcion ?? null,
  };
}

async function snapshotRelleno(slug) {
  if (!slug) return null;
  const r = await RellenoCotiza.findOne({ slug, activo: true });
  if (!r) return null;
  return {
    catalogoId: r._id,
    slug: r.slug,
    nombre: r.nombre,
    costoSnapshot: r.costoPorPorcion ?? 0,
  };
}

async function snapshotCobertura(slug) {
  if (!slug) return null;
  const c = await CoberturaCotiza.findOne({ slug, activo: true });
  if (!c) return null;
  return {
    catalogoId: c._id,
    slug: c.slug,
    nombre: c.nombre,
    costoSnapshot: c.costoPorPorcion ?? 0,
    esFondant: !!c.esFondant,
  };
}

async function snapshotDecoraciones(slugs) {
  if (!Array.isArray(slugs) || slugs.length === 0) return [];
  const docs = await DecoracionCotiza.find({ slug: { $in: slugs }, activo: true });
  return docs.map((d) => ({
    catalogoId: d._id,
    slug: d.slug,
    nombre: d.nombre,
    // En este snapshot guardamos costoManual cuando no hay técnica.
    // Si hay técnica, el costo real se calcula en /calcular-costeo
    // (Fase D) leyendo la técnica viva — aquí no escalamos por porción.
    costoSnapshot: d.tecnicaCreativaId ? null : (d.costoManual ?? 0),
  }));
}

// ── POST público — crear nueva cotización ─────────────────────────

router.post("/", async (req, res) => {
  try {
    const body = req.body || {};

    // Resolver snapshots de catálogo en paralelo.
    const [sabor, relleno, cobertura, decoraciones] = await Promise.all([
      snapshotSabor(body.saborSlug),
      snapshotRelleno(body.rellenoSlug),
      snapshotCobertura(body.coberturaSlug),
      snapshotDecoraciones(body.decoracionesSlugs || []),
    ]);

    const doc = await CotizacionPersonalizada.create({
      evento: body.evento,
      niveles: body.niveles,
      sabor,
      relleno,
      cobertura,
      colorPrincipal: body.colorPrincipal || "",
      decoraciones,
      estilo: body.estilo || {},
      entrega: body.entrega || {},
      cliente: body.cliente,
      userId: body.userId || "",
    });

    res.status(201).json({ message: "Cotización creada", data: doc });
  } catch (e) {
    console.error("Error creando cotización personalizada:", e);
    res.status(400).json({ message: e.message });
  }
});

// ── GET admin = todo, user = suyas ───────────────────────────────

router.get("/", requireAuth, async (req, res) => {
  try {
    const filter = req.user.role === "admin" ? {} : { userId: String(req.user._id) };
    const projection = req.user.role === "admin" ? "" : "-notasInternas -costeoSnapshot";
    const data = await CotizacionPersonalizada.find(filter)
      .select(projection)
      .sort({ createdAt: -1 });
    res.json({ data, total: data.length });
  } catch (e) {
    console.error("Error listando cotizaciones personalizadas:", e);
    res.status(500).json({ message: e.message });
  }
});

// ── GET por id — público (admin ve TODO via header role) ─────────

router.get("/:id", async (req, res) => {
  try {
    // Si viene con auth y role admin → todo; si no, sin notas ni costeo.
    let isAdmin = false;
    const token = req.headers.authorization?.split(" ")[1];
    if (token) {
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(token, process.env.JWT_SIGN);
        isAdmin = decoded?.role === "admin";
      } catch (_) { /* token inválido → seguir como público */ }
    }
    const projection = isAdmin ? "" : "-notasInternas -costeoSnapshot";
    const doc = await CotizacionPersonalizada.findById(req.params.id).select(projection);
    if (!doc) return res.status(404).json({ message: "Cotización no encontrada" });
    res.json({ data: doc });
  } catch (e) {
    console.error("Error obteniendo cotización personalizada:", e);
    res.status(500).json({ message: e.message });
  }
});

// ── PUT — admin ──────────────────────────────────────────────────

router.put("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const doc = await CotizacionPersonalizada.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ message: "Cotización no encontrada" });

    // Sync Calendar igual que en pastelCotiza.
    syncCotizacionCalendar(CotizacionPersonalizada, doc, "Pastel");

    res.json({ message: "Cotización actualizada", data: doc });
  } catch (e) {
    console.error("Error actualizando cotización personalizada:", e);
    res.status(400).json({ message: e.message });
  }
});

// ── DELETE — admin ───────────────────────────────────────────────

router.delete("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const doc = await CotizacionPersonalizada.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Cotización no encontrada" });
    res.json({ message: "Cotización eliminada" });
  } catch (e) {
    console.error("Error eliminando cotización personalizada:", e);
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;
