const express = require("express");
const router = express.Router();
const crudFactory = require("../cotizacionCatalogos/_crudFactory");

const Porcion = require("../../models/vintage/porcion");
const Piso = require("../../models/vintage/piso");
const Forma = require("../../models/vintage/forma");
const Color = require("../../models/vintage/color");
const Decoracion = require("../../models/vintage/decoracion");
const SaborCotiza = require("../../models/cotizacionCatalogos/sabor");
const RellenoCotiza = require("../../models/cotizacionCatalogos/relleno");
const CoberturaCotiza = require("../../models/cotizacionCatalogos/cobertura");
const Insumo = require("../../models/insumos");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const precioConMargen = (costo, m) => round2(costo * (1 + (Number(m) || 0) / 100));

/**
 * Calcula el precio (NO el costo) de una configuración de pastel vintage.
 * Reutilizable: el builder lo llama para el total en vivo y el checkout lo
 * usa para fijar el monto. Cada aspecto aplica su propio margen; los de
 * receta usan el profit_margin de la receta. Nunca expone costos.
 */
async function cotizarVintage(body) {
  const items = [];
  // Guarda costo+precio+margen por aspecto (el público solo verá precio).
  const add = (concepto, costo, margen) => {
    const c = round2(costo);
    if (c <= 0 && margen <= 0) return;
    items.push({ concepto, costo: c, margen: Number(margen) || 0, precio: precioConMargen(c, margen) });
  };

  // Porción: base + domo + branding (siempre incluidos). Si el concepto
  // está vinculado a materia prima, usa el costo unitario ACTUAL del
  // insumo (cost del paquete / amount de unidades); si no, el manual.
  const porcion = body.porcionSlug ? await Porcion.findOne({ slug: body.porcionSlug, activo: true }) : null;
  const porciones = porcion?.porciones || 0;
  if (porcion) {
    const costoConcepto = async (insumoId, costoManual) => {
      if (insumoId) {
        const ins = await Insumo.findById(insumoId);
        if (ins) return (Number(ins.cost) || 0) / (Number(ins.amount) || 1);
      }
      return costoManual;
    };
    add("Base", await costoConcepto(porcion.insumoBaseId, porcion.costoBase), porcion.margenBase);
    add("Domo", await costoConcepto(porcion.insumoDomoId, porcion.costoDomo), porcion.margenDomo);
    add("Branding", await costoConcepto(porcion.insumoBrandingId, porcion.costoBranding), porcion.margenBranding);
  }

  // Pisos.
  if (body.pisosSlug) {
    const piso = await Piso.findOne({ slug: body.pisosSlug, activo: true });
    if (piso) add(`${piso.niveles} pisos`, piso.costo, piso.margen);
  }

  // Sabor / relleno (por porción) y cobertura (por gramos).
  const unitarioReceta = (doc, fallback) =>
    (doc?.recetaId && doc.recetaId.portions > 0)
      ? { unitario: doc.recetaId.total_cost / doc.recetaId.portions, margen: doc.recetaId.profit_margin ?? 0 }
      : { unitario: fallback, margen: 0 };

  if (body.saborSlug) {
    const s = await SaborCotiza.findOne({ slug: body.saborSlug, activo: true }).populate("recetaId");
    if (s) {
      const { unitario, margen } = unitarioReceta(s, s.costoUnitarioSnapshot ?? s.costoManualPorPorcion ?? 0);
      add(`Sabor: ${s.nombre}`, unitario * porciones, margen);
    }
  }
  if (body.rellenoSlug) {
    const r = await RellenoCotiza.findOne({ slug: body.rellenoSlug, activo: true }).populate("recetaId");
    if (r) {
      const { unitario, margen } = unitarioReceta(r, r.costoUnitarioSnapshot ?? r.costoPorPorcion ?? 0);
      add(`Relleno: ${r.nombre}`, unitario * porciones, margen);
    }
  }
  if (body.coberturaSlug) {
    const c = await CoberturaCotiza.findOne({ slug: body.coberturaSlug, activo: true }).populate("recetaId");
    if (c) {
      if (c.recetaId && c.recetaId.portions > 0) {
        const gramos = Math.round((porciones / 10) * 500); // 500 g por 10 porciones
        const costoPorGramo = c.recetaId.total_cost / c.recetaId.portions;
        add(`Cobertura: ${c.nombre}`, costoPorGramo * gramos, c.recetaId.profit_margin ?? 0);
      } else {
        add(`Cobertura: ${c.nombre}`, (c.costoUnitarioSnapshot ?? c.costoPorPorcion ?? 0) * porciones, 0);
      }
    }
  }

  // Color base.
  if (body.colorSlug) {
    const col = await Color.findOne({ slug: body.colorSlug, activo: true });
    if (col) add(`Color: ${col.nombre}`, col.costo, col.margen);
  }

  // Decoraciones (multi).
  const decoSlugs = (body.decoraciones || []).map((d) => d.slug).filter(Boolean);
  if (decoSlugs.length) {
    const decos = await Decoracion.find({ slug: { $in: decoSlugs }, activo: true });
    for (const d of decos) add(`Decoración: ${d.nombre}`, d.costo, d.margen);
  }

  const total = round2(items.reduce((a, x) => a + x.precio, 0));
  const totalCosto = round2(items.reduce((a, x) => a + (x.costo || 0), 0));
  return { items, total, totalCosto, porciones };
}

// Público: NUNCA expone costos, solo precios.
router.post("/cotizar", async (req, res) => {
  try {
    const r = await cotizarVintage(req.body || {});
    res.json({ items: r.items.map(({ concepto, precio }) => ({ concepto, precio })), total: r.total, porciones: r.porciones });
  } catch (e) {
    console.error("Error cotizando vintage:", e);
    res.status(400).json({ message: e.message });
  }
});

/**
 * Catálogos del pastel vintage, gestionables desde el dashboard.
 *   /vintage-catalogos/porciones
 *   /vintage-catalogos/pisos
 *   /vintage-catalogos/formas
 *   /vintage-catalogos/colores
 *   /vintage-catalogos/decoraciones
 */
router.use("/porciones", crudFactory({
  Model: Porcion,
  camposEditables: [
    "slug", "nombre", "porciones", "pisosMax", "anticipacionDias",
    "costoBase", "margenBase", "insumoBaseId", "costoDomo", "margenDomo", "insumoDomoId",
    "costoBranding", "margenBranding", "insumoBrandingId",
    "activo", "orden",
  ],
}));

router.use("/pisos", crudFactory({
  Model: Piso,
  camposEditables: ["slug", "nombre", "niveles", "costo", "margen", "activo", "orden"],
}));

router.use("/formas", crudFactory({
  Model: Forma,
  camposEditables: ["slug", "nombre", "emoji", "imagenUrl", "activo", "orden"],
}));

router.use("/colores", crudFactory({
  Model: Color,
  camposEditables: ["slug", "nombre", "hex", "imagenUrl", "costo", "margen", "activo", "orden"],
}));

router.use("/decoraciones", crudFactory({
  Model: Decoracion,
  camposEditables: ["slug", "nombre", "descripcion", "costo", "margen", "colores", "activo", "orden"],
}));

module.exports = router;
module.exports.cotizarVintage = cotizarVintage;
