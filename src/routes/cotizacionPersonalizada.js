const express = require("express");
const router = express.Router();
const CotizacionPersonalizada = require("../models/cotizacionPersonalizada");
const SaborCotiza = require("../models/cotizacionCatalogos/sabor");
const RellenoCotiza = require("../models/cotizacionCatalogos/relleno");
const CoberturaCotiza = require("../models/cotizacionCatalogos/cobertura");
const DecoracionCotiza = require("../models/cotizacionCatalogos/decoracion");
const Receta = require("../models/recetas/recetas");
const Cost = require("../models/costs");
const checkRoleToken = require("../middlewares/myRoleToken");
const { requireAuth } = checkRoleToken;
const { syncCotizacionCalendar } = require("../utils/cotizacionCalendarSync");
const { mountNotaInternaRoutes } = require("../utils/notaInternaRoute");

// Multiplicador de complejidad por número de pisos. Mismo valor que usa
// el front en cakePersonalizado.jsx para que el estimado del cliente
// coincida con el cálculo admin del back.
const MULTIPLICADOR_NIVELES = { 1: 1, 2: 1.25, 3: 1.55, 4: 1.95, 5: 2.35, 6: 2.75 };
function round2(n) { return Math.round(n * 100) / 100; }

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

// ── POST /:id/calcular-costeo — admin ────────────────────────────
//
// Resuelve receta del sabor + técnica creativa de cada decoración y
// produce un breakdown del costo REAL (no el estimado cliente-side).
//
// Algoritmo:
//   inv  = cotizacion.evento.invitados
//   mult = MULTIPLICADOR_NIVELES[niveles] (más pisos = más trabajo)
//
//   costoBizcocho   = unitarioReceta × inv × mult
//   costoRelleno    = relleno.costoPorPorcion × inv × mult
//   costoCobertura  = cobertura.costoPorPorcion × inv × mult
//   costoDecoraciones = Σ (técnica.costoBase + escalaPorPorcion × inv
//                                            + tiempoHoras × tarifaHora)
//                       || decoracion.costoManual
//
//   costoTotal     = bizcocho + relleno + cobertura + decoraciones
//   precioSugerido = costoTotal × (1 + markup)
//
// Guarda el snapshot en cotizacion.costeoSnapshot. Re-ejecutable
// (sobrescribe).

router.post("/:id/calcular-costeo", checkRoleToken("admin"), async (req, res) => {
  try {
    const cot = await CotizacionPersonalizada.findById(req.params.id);
    if (!cot) return res.status(404).json({ message: "Cotización no encontrada" });

    const inv     = Math.max(1, Number(cot.evento?.invitados) || 0);
    const niveles = cot.niveles || 1;
    const mult    = MULTIPLICADOR_NIVELES[niveles] ?? 1;

    // Markup: del body si viene, sino de Cost global (default 60%).
    const cfg = await Cost.findOne();
    const markup = typeof req.body.markupPct === "number"
      ? req.body.markupPct
      : (cfg?.markupCotizacionesPct ?? cfg?.markupPostresPct ?? 60);
    const tarifaHora = cfg?.laborCosts ?? 0;

    // ── Bizcocho ─────────────────────────────────────────────────
    let costoBizcocho = 0;
    let bizcochoDetalle = null;
    if (cot.sabor?.catalogoId) {
      const sabor = await SaborCotiza.findById(cot.sabor.catalogoId).populate("recetaId");
      if (sabor) {
        let unitario = 0;
        let fuente = "manual";
        if (sabor.recetaId && sabor.recetaId.portions > 0) {
          unitario = sabor.recetaId.total_cost / sabor.recetaId.portions;
          fuente = "receta";
        } else {
          unitario = sabor.costoUnitarioSnapshot ?? sabor.costoManualPorPorcion ?? 0;
        }
        costoBizcocho = round2(unitario * inv * mult);
        bizcochoDetalle = {
          slug: sabor.slug,
          nombre: sabor.nombre,
          costoUnitario: round2(unitario),
          fuente,
          recetaId: sabor.recetaId?._id || null,
          recetaNombre: sabor.recetaId?.nombre_receta || null,
        };
      }
    }

    // ── Relleno ──────────────────────────────────────────────────
    let costoRelleno = 0;
    let rellenoDetalle = null;
    if (cot.relleno?.catalogoId) {
      const rel = await RellenoCotiza.findById(cot.relleno.catalogoId);
      if (rel) {
        costoRelleno = round2((rel.costoPorPorcion || 0) * inv * mult);
        rellenoDetalle = { slug: rel.slug, nombre: rel.nombre, costoUnitario: rel.costoPorPorcion };
      }
    }

    // ── Cobertura ────────────────────────────────────────────────
    let costoCobertura = 0;
    let coberturaDetalle = null;
    if (cot.cobertura?.catalogoId) {
      const cob = await CoberturaCotiza.findById(cot.cobertura.catalogoId);
      if (cob) {
        costoCobertura = round2((cob.costoPorPorcion || 0) * inv * mult);
        coberturaDetalle = {
          slug: cob.slug, nombre: cob.nombre,
          costoUnitario: cob.costoPorPorcion, esFondant: cob.esFondant,
        };
      }
    }

    // ── Decoraciones ─────────────────────────────────────────────
    const decoIds = (cot.decoraciones || []).map((d) => d.catalogoId).filter(Boolean);
    const decoDocs = await DecoracionCotiza.find({ _id: { $in: decoIds } }).populate("tecnicaCreativaId");
    const decoracionesDetalle = [];
    let costoDecoraciones = 0;
    for (const d of decoDocs) {
      let costo = 0;
      let fuente = "manual";
      if (d.tecnicaCreativaId) {
        const t = d.tecnicaCreativaId;
        costo = (t.costoBase || 0) + (t.escalaPorPorcion || 0) * inv + (t.tiempoHoras || 0) * tarifaHora;
        fuente = "tecnica";
      } else {
        costo = d.costoManual || 0;
      }
      costo = round2(costo);
      costoDecoraciones += costo;
      decoracionesDetalle.push({
        slug: d.slug,
        nombre: d.nombre,
        costo,
        fuente,
        tecnicaId: d.tecnicaCreativaId?._id || null,
        tecnicaNombre: d.tecnicaCreativaId?.nombre || null,
      });
    }
    costoDecoraciones = round2(costoDecoraciones);

    // ── Totales ──────────────────────────────────────────────────
    const costoTotal     = round2(costoBizcocho + costoRelleno + costoCobertura + costoDecoraciones);
    const precioSugerido = round2(costoTotal * (1 + markup / 100));
    const gananciaNeta   = round2(precioSugerido - costoTotal);

    const snapshot = {
      fechaCosteo: new Date(),
      invitados: inv,
      niveles,
      multiplicadorNiveles: mult,
      tarifaHora,
      bizcocho: bizcochoDetalle,
      costoBizcocho,
      relleno: rellenoDetalle,
      costoRelleno,
      cobertura: coberturaDetalle,
      costoCobertura,
      decoraciones: decoracionesDetalle,
      costoDecoraciones,
      costoTotal,
      markupPct: markup,
      precioSugerido,
      gananciaNeta,
    };

    cot.costeoSnapshot = snapshot;
    await cot.save();

    res.json({ message: "Costeo calculado", data: snapshot });
  } catch (e) {
    console.error("Error calculando costeo:", e);
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
