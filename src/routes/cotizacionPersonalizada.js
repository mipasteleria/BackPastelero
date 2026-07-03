const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const CotizacionPersonalizada = require("../models/cotizacionPersonalizada");
const SaborCotiza = require("../models/cotizacionCatalogos/sabor");
const RellenoCotiza = require("../models/cotizacionCatalogos/relleno");
const CoberturaCotiza = require("../models/cotizacionCatalogos/cobertura");
const DecoracionCotiza = require("../models/cotizacionCatalogos/decoracion");
const PostreCotiza = require("../models/cotizacionCatalogos/postre");
const PastelLegacy = require("../models/pastelCotiza");
const CupcakeLegacy = require("../models/cupcakesCotiza");
const SnackLegacy = require("../models/snackCotiza");
const Receta = require("../models/recetas/recetas");
const Cost = require("../models/costs");
const checkRoleToken = require("../middlewares/myRoleToken");
const { requireAuth } = checkRoleToken;
const { syncPersonalizadaCalendar } = require("../utils/pedidoCalendarSync");
const { mountNotaInternaRoutes } = require("../utils/notaInternaRoute");
const nodemailer = require("nodemailer");
const { generarNumeroOrden } = require("../utils/orderNumber");

// Datos bancarios para anticipo por transferencia (se envían por correo).
const DATOS_BANCARIOS = {
  banco: "Citibanamex",
  clabe: "002320902695222820",
  tarjeta: "5256 7839 9715 6998",
};

const PREFIJO_ORDEN = { pastel: "PAS", cupcake: "CUP", "mesa-postres": "SNA" };

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
    costoSnapshot: r.costoUnitarioSnapshot ?? r.costoPorPorcion ?? 0,
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
    costoSnapshot: c.costoUnitarioSnapshot ?? c.costoPorPorcion ?? 0,
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

// Cupcakes: resuelve [{saborSlug, docenas}] a snapshots con docenas.
async function snapshotSaboresCupcake(filas) {
  if (!Array.isArray(filas) || filas.length === 0) return [];
  const out = [];
  for (const f of filas) {
    if (!f?.saborSlug) continue;
    const s = await SaborCotiza.findOne({ slug: f.saborSlug, activo: true });
    if (!s) continue;
    out.push({
      catalogoId: s._id,
      slug: s.slug,
      nombre: s.nombre,
      costoSnapshot: s.costoUnitarioSnapshot ?? s.costoManualPorPorcion ?? null,
      docenas: Math.max(1, Number(f.docenas) || 1),
    });
  }
  return out;
}

async function snapshotPostres(slugs) {
  if (!Array.isArray(slugs) || slugs.length === 0) return [];
  const docs = await PostreCotiza.find({ slug: { $in: slugs }, activo: true });
  return docs.map((p) => ({
    catalogoId: p._id,
    slug: p.slug,
    nombre: p.nombre,
    costoSnapshot: p.costoUnitarioSnapshot ?? p.costoManual ?? 0,
  }));
}

// ── POST público — crear nueva cotización ─────────────────────────

router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    const tipoProducto = ["pastel", "cupcake", "mesa-postres"].includes(body.tipoProducto)
      ? body.tipoProducto
      : "pastel";

    // Validez: 30 días desde el envío. Visible al cliente.
    const VALIDEZ_DIAS = 30;
    const validUntil = new Date(Date.now() + VALIDEZ_DIAS * 86400000);

    const base = {
      tipoProducto,
      evento: body.evento,
      colorPrincipal: body.colorPrincipal || "",
      estilo: body.estilo || {},
      // La entrega es el mismo día del evento (fuente única de la fecha).
      entrega: { ...(body.entrega || {}), fecha: body.evento?.fecha || (body.entrega || {}).fecha || null },
      cliente: body.cliente,
      userId: body.userId || "",
      validUntil,
      publicToken: crypto.randomBytes(16).toString("hex"),
    };

    // Número de orden legible (no rompe la creación si el contador falla).
    try {
      const { numeroOrden } = await generarNumeroOrden(PREFIJO_ORDEN[tipoProducto] || "PAS");
      base.numeroOrden = numeroOrden;
    } catch (e) {
      console.error("No se pudo generar numeroOrden:", e.message);
    }

    let doc;
    if (tipoProducto === "mesa-postres") {
      const postres = await snapshotPostres(body.postresSlugs || []);
      doc = await CotizacionPersonalizada.create({
        ...base,
        postresPorPersona: body.postresPorPersona || 1,
        postres,
      });
    } else {
      // pastel y cupcake comparten los mismos catálogos.
      const [relleno, cobertura, decoraciones] = await Promise.all([
        snapshotRelleno(body.rellenoSlug),
        snapshotCobertura(body.coberturaSlug),
        snapshotDecoraciones(body.decoracionesSlugs || []),
      ]);
      const extra = {};
      if (tipoProducto === "cupcake") {
        // Sabor por docena; el total de cupcakes = Σ docenas × 12.
        extra.saboresCupcake = await snapshotSaboresCupcake(body.saboresCupcakeData || []);
        const totalCupcakes = extra.saboresCupcake.reduce((a, r) => a + r.docenas, 0) * 12;
        if (totalCupcakes > 0) base.evento = { ...base.evento, invitados: totalCupcakes };
        extra.sabor = extra.saboresCupcake[0]
          ? { catalogoId: extra.saboresCupcake[0].catalogoId, slug: extra.saboresCupcake[0].slug, nombre: extra.saboresCupcake[0].nombre, costoSnapshot: extra.saboresCupcake[0].costoSnapshot }
          : null;
      } else {
        extra.sabor = await snapshotSabor(body.saborSlug);
      }
      doc = await CotizacionPersonalizada.create({
        ...base,
        niveles: tipoProducto === "cupcake" ? 1 : (body.niveles || 1),
        relleno,
        cobertura,
        decoraciones,
        ...extra,
      });
    }

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

// ── Enlace público por token (invitado, sin login) ───────────────
//
// Devuelve solo campos seguros para que el cliente vea su cotización y
// precio sin necesidad de cuenta. NUNCA expone notas internas, costeo ni
// userId.

const PROJ_PUBLICA =
  "-notasInternas -costeoSnapshot -costeoExtras -userId -__v";

router.get("/public/:token", async (req, res) => {
  try {
    const doc = await CotizacionPersonalizada.findOne({ publicToken: req.params.token }).select(PROJ_PUBLICA);
    if (!doc) return res.status(404).json({ message: "Cotización no encontrada" });
    res.json({ data: doc });
  } catch (e) {
    console.error("Error obteniendo cotización pública:", e);
    res.status(500).json({ message: e.message });
  }
});

// El cliente confirma que pagará el anticipo por transferencia/efectivo.
router.post("/public/:token/confirmar", async (req, res) => {
  try {
    const metodo = ["transferencia", "efectivo"].includes(req.body?.metodo)
      ? req.body.metodo
      : "transferencia";
    const doc = await CotizacionPersonalizada.findOne({ publicToken: req.params.token });
    if (!doc) return res.status(404).json({ message: "Cotización no encontrada" });

    doc.confirmacionCliente = { confirmado: true, metodo, fecha: new Date() };
    doc.notasInternas.push({
      texto: `El cliente confirmó su pedido y pagará el anticipo por ${metodo}.`,
      autorNombre: "Cliente (enlace público)",
    });
    await doc.save();

    // Correo al cliente: para transferencia incluye los datos bancarios.
    enviarCorreoConfirmacion(doc, metodo).catch((e) =>
      console.error("Error enviando correo de confirmación:", e.message)
    );

    res.json({ message: "Confirmación registrada", data: { confirmado: true, metodo } });
  } catch (e) {
    console.error("Error confirmando cotización pública:", e);
    res.status(400).json({ message: e.message });
  }
});

// El cliente solicita ajustes a su cotización (desde el enlace público).
router.post("/public/:token/solicitar-ajuste", async (req, res) => {
  try {
    const mensaje = String(req.body?.mensaje || "").trim();
    if (!mensaje) return res.status(400).json({ message: "Escribe tu solicitud de ajuste" });
    const doc = await CotizacionPersonalizada.findOne({ publicToken: req.params.token });
    if (!doc) return res.status(404).json({ message: "Cotización no encontrada" });

    doc.notasInternas.push({
      texto: `Solicitud de ajuste del cliente: ${mensaje}`,
      autorNombre: "Cliente (enlace público)",
    });
    await doc.save();

    // Aviso al admin (best-effort).
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });
      await transporter.sendMail({
        from: `Pastelería el Ruiseñor <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_USER,
        subject: `Solicitud de ajuste · ${doc.numeroOrden || doc._id}`,
        text: `${doc.cliente?.nombre || "Cliente"} solicitó ajustes en su cotización ${doc.numeroOrden || doc._id}:\n\n${mensaje}`,
      });
    } catch (e) { console.error("Error correo ajuste:", e.message); }

    res.json({ message: "Solicitud enviada" });
  } catch (e) {
    console.error("Error solicitando ajuste:", e);
    res.status(400).json({ message: e.message });
  }
});

// Admin: asegura que la cotización tenga publicToken y lo devuelve (sirve
// para cotizaciones creadas antes de existir el campo).
router.post("/:id/generar-enlace", checkRoleToken("admin"), async (req, res) => {
  try {
    const doc = await CotizacionPersonalizada.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Cotización no encontrada" });
    let cambio = false;
    if (!doc.publicToken) {
      doc.publicToken = crypto.randomBytes(16).toString("hex");
      cambio = true;
    }
    if (!doc.numeroOrden) {
      try {
        const { numeroOrden } = await generarNumeroOrden(PREFIJO_ORDEN[doc.tipoProducto] || "PAS");
        doc.numeroOrden = numeroOrden;
        cambio = true;
      } catch (e) { console.error("No se pudo generar numeroOrden:", e.message); }
    }
    if (cambio) await doc.save();
    res.json({ message: "Enlace listo", data: { publicToken: doc.publicToken } });
  } catch (e) {
    res.status(400).json({ message: e.message });
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
    const body = req.body || {};
    const update = { ...body };

    // Si el admin manda slugs de catálogo (edición completa), reconstruimos
    // los snapshots — igual que al crear — y quitamos las claves *Slug.
    if (Object.prototype.hasOwnProperty.call(body, "saborSlug")) {
      update.sabor = await snapshotSabor(body.saborSlug);
      delete update.saborSlug;
    }
    if (Object.prototype.hasOwnProperty.call(body, "rellenoSlug")) {
      update.relleno = await snapshotRelleno(body.rellenoSlug);
      delete update.rellenoSlug;
    }
    if (Object.prototype.hasOwnProperty.call(body, "coberturaSlug")) {
      update.cobertura = await snapshotCobertura(body.coberturaSlug);
      delete update.coberturaSlug;
    }
    if (Object.prototype.hasOwnProperty.call(body, "decoracionesSlugs")) {
      update.decoraciones = await snapshotDecoraciones(body.decoracionesSlugs || []);
      delete update.decoracionesSlugs;
    }
    if (Object.prototype.hasOwnProperty.call(body, "postresSlugs")) {
      update.postres = await snapshotPostres(body.postresSlugs || []);
      delete update.postresSlugs;
    }
    if (Object.prototype.hasOwnProperty.call(body, "saboresCupcakeData")) {
      const sc = await snapshotSaboresCupcake(body.saboresCupcakeData || []);
      update.saboresCupcake = sc;
      update.sabor = sc[0]
        ? { catalogoId: sc[0].catalogoId, slug: sc[0].slug, nombre: sc[0].nombre, costoSnapshot: sc[0].costoSnapshot }
        : null;
      const totalCupcakes = sc.reduce((a, r) => a + r.docenas, 0) * 12;
      if (totalCupcakes > 0) update.evento = { ...(update.evento || {}), invitados: totalCupcakes };
      delete update.saboresCupcakeData;
    }

    // La fecha de entrega siempre es la del evento.
    if (update.evento?.fecha) {
      update.entrega = { ...(update.entrega || {}), fecha: update.evento.fecha };
    }

    const doc = await CotizacionPersonalizada.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ message: "Cotización no encontrada" });

    // Sync Calendar (crea evento al pasar a Agendado, borra al Cancelar).
    syncPersonalizadaCalendar(CotizacionPersonalizada, doc);

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

    // Renglones extra que el admin agregó a mano — se suman a la base.
    const extras = (cot.costeoExtras || []).map((x) => ({
      tipo: x.tipo,
      concepto: x.concepto,
      costoUnitario: round2(x.costoUnitario || 0),
      cantidad: x.cantidad || 1,
      subtotal: round2(x.subtotal || 0),
    }));
    const costoExtras = round2(extras.reduce((acc, x) => acc + (x.subtotal || 0), 0));

    const inv     = Math.max(1, Number(cot.evento?.invitados) || 0);
    const niveles = cot.niveles || 1;
    const mult    = MULTIPLICADOR_NIVELES[niveles] ?? 1;

    // Markup: del body si viene, sino de Cost global (default 60%).
    const cfg = await Cost.findOne();
    const markup = typeof req.body.markupPct === "number"
      ? req.body.markupPct
      : (cfg?.markupCotizacionesPct ?? cfg?.markupPostresPct ?? 60);
    const tarifaHora = cfg?.laborCosts ?? 0;

    // ── Mesa de postres ──────────────────────────────────────────
    // Costo estimado: total de piezas = personas × postres por persona,
    // repartidas equitativamente entre los postres elegidos.
    if (cot.tipoProducto === "mesa-postres") {
      const piezasTotales = inv * (cot.postresPorPersona || 1);
      const ids = (cot.postres || []).map((p) => p.catalogoId).filter(Boolean);
      const docs = await PostreCotiza.find({ _id: { $in: ids } }).populate("recetaId");
      const piezasPorTipo = docs.length > 0 ? piezasTotales / docs.length : 0;

      const precioConMargen = (costo, m) => round2(costo * (1 + (Number(m) || 0) / 100));
      const postresDetalle = [];
      let costoPostres = 0, precioPostres = 0;
      for (const p of docs) {
        let unitario = 0, margenPct = markup, fuente = "manual";
        if (p.recetaId && p.recetaId.portions > 0) {
          unitario = p.recetaId.total_cost / p.recetaId.portions;
          margenPct = p.recetaId.profit_margin ?? markup;
          fuente = "receta";
        } else {
          unitario = p.costoUnitarioSnapshot ?? p.costoManual ?? 0;
        }
        const costo = round2(unitario * piezasPorTipo);
        const precio = precioConMargen(costo, margenPct);
        costoPostres += costo; precioPostres += precio;
        postresDetalle.push({
          slug: p.slug, nombre: p.nombre,
          costoUnitario: round2(unitario), piezas: Math.round(piezasPorTipo),
          costo, margenPct, precio, fuente,
          recetaId: p.recetaId?._id || null,
          recetaNombre: p.recetaId?.nombre_receta || null,
        });
      }
      costoPostres = round2(costoPostres);
      precioPostres = round2(precioPostres);
      const costoTotalMesa = round2(costoPostres + costoExtras);
      const precioExtrasMesa = precioConMargen(costoExtras, markup);
      const precioSugeridoMesa = round2(precioPostres + precioExtrasMesa);

      const snapshotMesa = {
        fechaCosteo: new Date(),
        tipoProducto: "mesa-postres",
        personas: inv,
        postresPorPersona: cot.postresPorPersona || 1,
        piezasTotales,
        postres: postresDetalle,
        costoPostres, precioPostres,
        extras,
        costoExtras, precioExtras: precioExtrasMesa,
        costoTotal: costoTotalMesa,
        markupPct: markup,
        precioSugerido: precioSugeridoMesa,
        gananciaNeta: round2(precioSugeridoMesa - costoTotalMesa),
      };

      cot.costeoSnapshot = snapshotMesa;
      await cot.save();
      return res.json({ message: "Costeo calculado", data: snapshotMesa });
    }

    // Precio = costo × (1 + margen). Cada elemento con receta usa el margen
    // de SU receta (profit_margin); los demás usan el markup global. Así no
    // se dobla la ganancia que ya trae la receta.
    const precioConMargen = (costo, m) => round2(costo * (1 + (Number(m) || 0) / 100));

    // ── Bizcocho ─────────────────────────────────────────────────
    let costoBizcocho = 0;
    let precioBizcocho = 0;
    let bizcochoDetalle = null;
    if (cot.tipoProducto === "cupcake" && (cot.saboresCupcake || []).length) {
      const detalles = [];
      for (const fila of cot.saboresCupcake) {
        let unitario = 0, margenPct = markup, fuente = "manual", recetaNombre = null;
        if (fila.catalogoId) {
          const s = await SaborCotiza.findById(fila.catalogoId).populate("recetaId");
          if (s) {
            if (s.recetaId && s.recetaId.portions > 0) {
              unitario = s.recetaId.total_cost / s.recetaId.portions;
              margenPct = s.recetaId.profit_margin ?? markup;
              fuente = "receta"; recetaNombre = s.recetaId.nombre_receta;
            } else {
              unitario = s.costoUnitarioSnapshot ?? s.costoManualPorPorcion ?? 0;
            }
          }
        }
        const piezas = (fila.docenas || 0) * 12;
        const costo = round2(unitario * piezas * mult);
        const precio = precioConMargen(costo, margenPct);
        costoBizcocho += costo; precioBizcocho += precio;
        detalles.push({ slug: fila.slug, nombre: fila.nombre, docenas: fila.docenas, costoUnitario: round2(unitario), costo, margenPct, precio, fuente, recetaNombre });
      }
      costoBizcocho = round2(costoBizcocho);
      precioBizcocho = round2(precioBizcocho);
      bizcochoDetalle = { porSabor: detalles };
    } else if (cot.sabor?.catalogoId) {
      const sabor = await SaborCotiza.findById(cot.sabor.catalogoId).populate("recetaId");
      if (sabor) {
        let unitario = 0, margenPct = markup, fuente = "manual";
        if (sabor.recetaId && sabor.recetaId.portions > 0) {
          unitario = sabor.recetaId.total_cost / sabor.recetaId.portions;
          margenPct = sabor.recetaId.profit_margin ?? markup;
          fuente = "receta";
        } else {
          unitario = sabor.costoUnitarioSnapshot ?? sabor.costoManualPorPorcion ?? 0;
        }
        costoBizcocho = round2(unitario * inv * mult);
        precioBizcocho = precioConMargen(costoBizcocho, margenPct);
        bizcochoDetalle = {
          slug: sabor.slug, nombre: sabor.nombre,
          costoUnitario: round2(unitario), fuente, margenPct, precio: precioBizcocho,
          recetaId: sabor.recetaId?._id || null,
          recetaNombre: sabor.recetaId?.nombre_receta || null,
        };
      }
    }

    // ── Relleno ──────────────────────────────────────────────────
    let costoRelleno = 0, precioRelleno = 0, rellenoDetalle = null;
    if (cot.relleno?.catalogoId) {
      const rel = await RellenoCotiza.findById(cot.relleno.catalogoId).populate("recetaId");
      if (rel) {
        let unitario = 0, margenPct = markup, fuente = "manual";
        if (rel.recetaId && rel.recetaId.portions > 0) {
          unitario = rel.recetaId.total_cost / rel.recetaId.portions;
          margenPct = rel.recetaId.profit_margin ?? markup;
          fuente = "receta";
        } else {
          unitario = rel.costoUnitarioSnapshot ?? rel.costoPorPorcion ?? 0;
        }
        costoRelleno = round2(unitario * inv * mult);
        precioRelleno = precioConMargen(costoRelleno, margenPct);
        rellenoDetalle = {
          slug: rel.slug, nombre: rel.nombre,
          costoUnitario: round2(unitario), fuente, margenPct, precio: precioRelleno,
          recetaId: rel.recetaId?._id || null,
          recetaNombre: rel.recetaId?.nombre_receta || null,
        };
      }
    }

    // ── Cobertura (por gramos: 500 g/docena cupcakes · 500 g/10 porciones) ──
    // Gramos base editables por el admin (cot.coberturaGramos).
    const coberturaGramosBase = cot.tipoProducto === "cupcake"
      ? Math.round((inv / 12) * 500)   // inv = total cupcakes
      : Math.round((inv / 10) * 500);  // pastel: por porciones
    const coberturaGramos = (cot.coberturaGramos != null && cot.coberturaGramos !== "")
      ? Number(cot.coberturaGramos)
      : coberturaGramosBase;

    let costoCobertura = 0, precioCobertura = 0, coberturaDetalle = null;
    if (cot.cobertura?.catalogoId) {
      const cob = await CoberturaCotiza.findById(cot.cobertura.catalogoId).populate("recetaId");
      if (cob) {
        let margenPct = markup, fuente = "manual";
        let costoPorGramo = 0;     // costo de la receta por gramo
        let usaGramos = false;
        if (cob.recetaId && cob.recetaId.portions > 0) {
          // La receta de cobertura rinde `portions` gramos → costo por gramo.
          costoPorGramo = cob.recetaId.total_cost / cob.recetaId.portions;
          margenPct = cob.recetaId.profit_margin ?? markup;
          fuente = "receta";
          usaGramos = true;
        }
        if (usaGramos) {
          costoCobertura = round2(costoPorGramo * coberturaGramos * mult);
        } else {
          // Sin receta: costo manual por porción (comportamiento previo).
          const unitario = cob.costoUnitarioSnapshot ?? cob.costoPorPorcion ?? 0;
          costoCobertura = round2(unitario * inv * mult);
        }
        precioCobertura = precioConMargen(costoCobertura, margenPct);
        coberturaDetalle = {
          slug: cob.slug, nombre: cob.nombre,
          fuente, margenPct, precio: precioCobertura, esFondant: cob.esFondant,
          gramos: usaGramos ? coberturaGramos : null,
          gramosBase: usaGramos ? coberturaGramosBase : null,
          costoPorGramo: usaGramos ? round2(costoPorGramo) : null,
          recetaId: cob.recetaId?._id || null,
          recetaNombre: cob.recetaId?.nombre_receta || null,
        };
      }
    }

    // ── Decoraciones (sin receta → markup global) ────────────────
    const decoIds = (cot.decoraciones || []).map((d) => d.catalogoId).filter(Boolean);
    const decoDocs = await DecoracionCotiza.find({ _id: { $in: decoIds } }).populate("tecnicaCreativaId");
    const decoracionesDetalle = [];
    let costoDecoraciones = 0, precioDecoraciones = 0;
    for (const d of decoDocs) {
      let costo = 0, fuente = "manual";
      if (d.tecnicaCreativaId) {
        const t = d.tecnicaCreativaId;
        costo = (t.costoBase || 0) + (t.escalaPorPorcion || 0) * inv + (t.tiempoHoras || 0) * tarifaHora;
        fuente = "tecnica";
      } else {
        costo = d.costoManual || 0;
      }
      costo = round2(costo);
      const precio = precioConMargen(costo, markup);
      costoDecoraciones += costo; precioDecoraciones += precio;
      decoracionesDetalle.push({
        slug: d.slug, nombre: d.nombre, costo, margenPct: markup, precio, fuente,
        tecnicaId: d.tecnicaCreativaId?._id || null,
        tecnicaNombre: d.tecnicaCreativaId?.nombre || null,
      });
    }
    costoDecoraciones = round2(costoDecoraciones);
    precioDecoraciones = round2(precioDecoraciones);

    // Extras: markup global (renglones manuales del admin).
    const precioExtras = precioConMargen(costoExtras, markup);

    // ── Totales ──────────────────────────────────────────────────
    const costoBase      = round2(costoBizcocho + costoRelleno + costoCobertura + costoDecoraciones);
    const costoTotal     = round2(costoBase + costoExtras);
    const precioSugerido = round2(precioBizcocho + precioRelleno + precioCobertura + precioDecoraciones + precioExtras);
    const gananciaNeta   = round2(precioSugerido - costoTotal);

    const snapshot = {
      fechaCosteo: new Date(),
      invitados: inv,
      niveles,
      multiplicadorNiveles: mult,
      tarifaHora,
      bizcocho: bizcochoDetalle,
      costoBizcocho, precioBizcocho,
      relleno: rellenoDetalle,
      costoRelleno, precioRelleno,
      cobertura: coberturaDetalle,
      costoCobertura, precioCobertura,
      decoraciones: decoracionesDetalle,
      costoDecoraciones, precioDecoraciones,
      extras,
      costoExtras, precioExtras,
      costoBase,
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

// ── Migración de cotizaciones legacy → personalizada (admin) ──────
//
// No destructivo: crea una CotizacionPersonalizada por cada registro
// legacy (pastel/cupcake/snack) que aún no se haya migrado (dedupe por
// legacyRef.id). El legacy NO se borra.

function parseDeliveryDate(s) {
  // Formatos: "DD/MM/YYYY" o "DD/MM/YYYY HH:MM".
  if (!s) return { fecha: null, hora: "" };
  const m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return { fecha: null, hora: "" };
  const [, dd, mm, yyyy, hh, mi] = m;
  const fecha = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
  const hora = hh ? `${String(hh).padStart(2, "0")}:${mi}` : "";
  return { fecha, hora };
}

function mapStatusLegacy(s) {
  const t = String(s || "").toLowerCase();
  if (/100|50|agendad/.test(t)) return "Agendado · producción";
  if (/entreg/.test(t)) return "Entregado";
  if (/cancel/.test(t)) return "Cancelado";
  if (/cotiz/.test(t)) return "Cotizada";
  return "Pendiente";
}

function imagenesLegacy(images, apiBase) {
  if (!Array.isArray(images)) return [];
  return images.filter(Boolean).map((x) =>
    /^https?:\/\//.test(x) ? x : `${apiBase}/file/${x}`
  );
}

function snapsDesdeBooleans(doc, mapa) {
  const out = [];
  for (const [campo, nombre] of mapa) if (doc[campo]) out.push({ nombre });
  if (doc.other) out.push({ nombre: String(doc.other) });
  return out;
}

const DECO_PASTEL = [
  ["fondantCover", "Cubierta de fondant"], ["fondantDraw", "Dibujos en fondant"],
  ["fondantFlowers", "Flores de fondant"], ["naturalFlowers", "Flores naturales"],
  ["buttercreamDraw", "Dibujos en buttercream"], ["eatablePrint", "Impresión comestible"],
  ["sign", "Topper / letrero"], ["character", "Personaje"],
];
const DECO_CUPCAKE = [
  ["fondantCover", "Cubierta de fondant"], ["fondantDraw", "Dibujos en fondant"],
  ["buttercreamDraw", "Dibujos en buttercream"], ["naturalFlowers", "Flores naturales"],
  ["eatablePrint", "Impresión comestible"], ["sign", "Toppers con texto"],
  ["sprinkles", "Sprinkles"],
];
const POSTRES_MESA = [
  ["pay", "Pay de queso"], ["brownie", "Brownie"], ["coockie", "Galletas decoradas"],
  ["alfajores", "Alfajores"], ["macaroni", "Macarrones"], ["donuts", "Donas"],
  ["lollipops", "Paletas"], ["cupcakes", "Cupcakes"], ["bread", "Pan de naranja"],
  ["tortaFruts", "Torta de frutas"], ["americanCoockies", "Galletas americanas"],
  ["tortaApple", "Torta de manzana"],
];

function comentariosLegacy(doc) {
  const partes = [];
  if (doc.questionsOrComments) partes.push(String(doc.questionsOrComments));
  if (doc.budget) partes.push(`Presupuesto indicado: ${doc.budget}`);
  return partes.join(" · ");
}

async function migrarUno(doc, tipo, apiBase) {
  const { fecha, hora } = parseDeliveryDate(doc.deliveryDate);
  const eventoFecha = fecha || new Date();
  const tipoProducto = tipo === "snack" ? "mesa-postres" : tipo;
  const invitados = Math.max(1, parseInt(tipo === "snack" ? doc.people : doc.portions, 10) || 1);

  const base = {
    tipoProducto,
    legacyRef: { tipo, id: doc._id },
    evento: { tipo: "otro", fecha: eventoFecha, invitados },
    colorPrincipal: "",
    estilo: { value: "", comentarios: comentariosLegacy(doc), imagenesInspiracion: imagenesLegacy(doc.images, apiBase) },
    entrega: {
      tipo: doc.delivery ? "domicilio" : "recoger-local",
      fecha: eventoFecha,
      hora,
      direccion: doc.deliveryAdress || "",
    },
    cliente: {
      nombre: doc.contactName || "Cliente",
      telefono: doc.contactPhone || "0000000000",
      email: "",
    },
    userId: doc.userId || "",
    status: mapStatusLegacy(doc.status),
    precio: doc.precio,
    anticipo: doc.anticipo,
    saldoPendiente: doc.saldoPendiente || 0,
    validUntil: new Date((doc.createdAt ? new Date(doc.createdAt).getTime() : Date.now()) + 30 * 86400000),
    publicToken: crypto.randomBytes(16).toString("hex"),
  };

  if (tipoProducto === "mesa-postres") {
    base.postresPorPersona = Math.max(1, parseInt(doc.portionsPerPerson, 10) || 1);
    base.postres = snapsDesdeBooleans(doc, POSTRES_MESA);
  } else {
    base.niveles = tipo === "cupcake" ? 1 : Math.max(1, parseInt(doc.levels, 10) || 1);
    base.sabor = (doc.flavor || doc.flavorBizcocho) ? { nombre: doc.flavor || doc.flavorBizcocho } : null;
    base.relleno = doc.stuffedFlavor ? { nombre: doc.stuffedFlavor } : null;
    base.cobertura = doc.cover ? { nombre: doc.cover, esFondant: !!(doc.fondant || doc.fondantCover) } : null;
    base.decoraciones = snapsDesdeBooleans(doc, tipo === "cupcake" ? DECO_CUPCAKE : DECO_PASTEL);
  }

  try {
    const { numeroOrden } = await generarNumeroOrden(PREFIJO_ORDEN[tipoProducto] || "PAS");
    base.numeroOrden = numeroOrden;
  } catch (_) {}

  return CotizacionPersonalizada.create(base);
}

router.post("/migrar-legacy", checkRoleToken("admin"), async (req, res) => {
  try {
    const apiBase = process.env.API_PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
    const lotes = [
      { tipo: "pastel", docs: await PastelLegacy.find() },
      { tipo: "cupcake", docs: await CupcakeLegacy.find() },
      { tipo: "snack", docs: await SnackLegacy.find() },
    ];
    const resumen = { migradas: 0, omitidas: 0, errores: [] };
    for (const { tipo, docs } of lotes) {
      for (const doc of docs) {
        const yaExiste = await CotizacionPersonalizada.exists({ "legacyRef.id": doc._id });
        if (yaExiste) { resumen.omitidas++; continue; }
        try {
          await migrarUno(doc, tipo, apiBase);
          resumen.migradas++;
        } catch (e) {
          resumen.errores.push({ tipo, id: String(doc._id), error: e.message });
        }
      }
    }
    res.json({ message: "Migración completada", ...resumen });
  } catch (e) {
    console.error("Error migrando legacy:", e);
    res.status(500).json({ message: e.message });
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

// ── Correo de confirmación al cliente ─────────────────────────────
async function enviarCorreoConfirmacion(cot, metodo) {
  const to = cot.cliente?.email;
  if (!to) return; // sin correo no hay a quién enviar

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  const precio = Number(cot.precio) || 0;
  const anticipo = cot.anticipo != null ? Number(cot.anticipo) : Math.round(precio * 0.5);
  const fechaEntrega = cot.evento?.fecha
    ? new Date(cot.evento.fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })
    : "Por confirmar";

  const detallesPedido = cot.tipoProducto === "mesa-postres"
    ? `Mesa de postres · ${cot.evento?.invitados} personas · ${(cot.postres || []).map((p) => p.nombre).join(", ")}`
    : `${cot.tipoProducto === "cupcake" ? "Cupcakes" : "Pastel"} para ${cot.evento?.invitados} porciones · ` +
      `Pan: ${cot.sabor?.nombre || "—"} · Relleno: ${cot.relleno?.nombre || "—"} · Cobertura: ${cot.cobertura?.nombre || "—"}`;

  const bloqueBanco = metodo === "transferencia"
    ? `
      <h3 style="color:#540027;margin:16px 0 6px">Datos para tu transferencia (anticipo 50%)</h3>
      <p style="margin:0"><strong>Banco:</strong> ${DATOS_BANCARIOS.banco}</p>
      <p style="margin:0"><strong>CLABE:</strong> ${DATOS_BANCARIOS.clabe}</p>
      <p style="margin:0"><strong>No. de Tarjeta:</strong> ${DATOS_BANCARIOS.tarjeta}</p>
      <p style="margin:8px 0 0">Anticipo a depositar: <strong>$${anticipo.toLocaleString("es-MX")} MXN</strong>.
      Cuando realices la transferencia, envíanos el comprobante por WhatsApp citando tu número de orden
      <strong>${cot.numeroOrden || ""}</strong>.</p>`
    : `
      <p style="margin:8px 0 0">Coordinaremos contigo el pago del anticipo
      (<strong>$${anticipo.toLocaleString("es-MX")} MXN</strong>) en efectivo.
      Tu número de orden es <strong>${cot.numeroOrden || ""}</strong>.</p>`;

  await transporter.sendMail({
    from: `Pastelería el Ruiseñor <${process.env.EMAIL_USER}>`,
    to,
    subject: `Confirmación de tu pedido ${cot.numeroOrden || ""} 🎂`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#3a3a3a;max-width:560px">
        <h2 style="color:#540027">¡Gracias por confirmar tu pedido, ${cot.cliente?.nombre || ""}!</h2>
        <p>Estos son los detalles de tu pedido:</p>
        <p style="margin:0"><strong>Número de orden:</strong> ${cot.numeroOrden || "—"}</p>
        <p style="margin:0"><strong>Fecha de entrega:</strong> ${fechaEntrega}</p>
        <p style="margin:0"><strong>Detalle:</strong> ${detallesPedido}</p>
        <p style="margin:6px 0 0"><strong>Total:</strong> $${precio.toLocaleString("es-MX")} MXN ·
          <strong>Anticipo (50%):</strong> $${anticipo.toLocaleString("es-MX")} MXN</p>
        ${bloqueBanco}
        <p style="margin-top:16px;font-size:13px;color:#888">
          Horario de atención: Lunes a Viernes de 9am a 6pm. Cualquier duda, estamos al pendiente. 🌸
        </p>
      </div>`,
  });
}

module.exports = router;
