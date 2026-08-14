const express = require("express");
const router = express.Router();
const Pedido = require("../../models/vintage/pedido");
const checkRoleToken = require("../../middlewares/myRoleToken");
const { requireAuth } = checkRoleToken;
const { resolverZona } = require("../../utils/zonasEnvio");
const { generarNumeroOrden } = require("../../utils/orderNumber");
const { mountNotaInternaRoutes } = require("../../utils/notaInternaRoute");
const { syncVintageCalendar } = require("../../utils/pedidoCalendarSync");
const { cotizarVintage } = require("./index");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

mountNotaInternaRoutes(router, Pedido, "Pastel Vintage");

// ── POST público — crear pedido ──────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.cliente?.nombre || !body.cliente?.telefono) {
      return res.status(400).json({ message: "Faltan datos de contacto" });
    }
    if (!body.porcionSlug) return res.status(400).json({ message: "Falta el tamaño" });
    if (body.fecha && await require("../dashboardAgenda").esFechaBloqueada(body.fecha)) {
      return res.status(409).json({ message: "Esa fecha no está disponible, elige otro día" });
    }

    // Precio autoritativo en el servidor (con costos para el admin).
    const cot = await cotizarVintage(body);
    if (cot.total <= 0) return res.status(400).json({ message: "No se pudo calcular el precio" });

    // Envío.
    const esDomicilio = body.entrega?.tipo === "domicilio";
    let envio = { tipo: body.entrega?.tipo || "recoger-local", zona: "", costo: 0,
      colonia: body.entrega?.colonia || "", municipio: body.entrega?.municipio || "",
      direccion: body.entrega?.direccion || "", hora: body.entrega?.hora || "" };
    if (esDomicilio) {
      const z = resolverZona({ colonia: body.entrega?.colonia, municipio: body.entrega?.municipio });
      envio.zona = z.zona; envio.costo = z.costo;
    }

    const total = round2(cot.total + envio.costo);
    const anticipo = round2(total * 0.5);

    let numeroOrden = "";
    try { numeroOrden = (await generarNumeroOrden("VIN")).numeroOrden; } catch (_) {}

    const doc = await Pedido.create({
      numeroOrden,
      userId: body.userId || "",
      seleccion: {
        porcionSlug: body.porcionSlug, pisosSlug: body.pisosSlug, formaSlug: body.formaSlug,
        saborSlug: body.saborSlug, rellenoSlug: body.rellenoSlug, coberturaSlug: body.coberturaSlug,
        colorSlug: body.colorSlug, decoraciones: body.decoraciones || [], porciones: cot.porciones,
      },
      desglose: cot.items,
      totalProductos: cot.total,
      totalCosto: cot.totalCosto,
      envio,
      total, precio: total,
      anticipo, saldoPendiente: total,
      cliente: body.cliente,
      fecha: body.fecha || null,
      notas: body.notas || "",
      status: "Pendiente",
    });

    res.status(201).json({ message: "Pedido creado", data: { _id: doc._id, total, anticipo, numeroOrden } });
  } catch (e) {
    console.error("Error creando pedido vintage:", e);
    res.status(400).json({ message: e.message });
  }
});

// ── GET admin = todos, user = suyos ──────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const filter = req.user.role === "admin" ? {} : { userId: String(req.user._id) };
    const data = await Pedido.find(filter).sort({ createdAt: -1 });
    res.json({ data, total: data.length });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── GET por id (admin TODO; público sin notas) ───────────────────
router.get("/:id", async (req, res) => {
  try {
    let isAdmin = false;
    const token = req.headers.authorization?.split(" ")[1];
    if (token) {
      try {
        const jwt = require("jsonwebtoken");
        isAdmin = jwt.verify(token, process.env.JWT_SIGN)?.role === "admin";
      } catch (_) {}
    }
    const projection = isAdmin ? "" : "-notasInternas -totalCosto";
    const doc = await Pedido.findById(req.params.id).select(projection);
    if (!doc) return res.status(404).json({ message: "Pedido no encontrado" });
    res.json({ data: doc });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ── PUT admin ────────────────────────────────────────────────────
router.put("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const doc = await Pedido.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: "Pedido no encontrado" });
    syncVintageCalendar(Pedido, doc);

    // Si el admin agenda el pedido manualmente (anticipo en efectivo/
    // transferencia), enviar la confirmación al cliente una sola vez.
    if (/^Agendado/.test(doc.status || "") && !doc.confirmacionEnviadaAt) {
      try {
        const { sendVintageConfirmation, sendVintageConfirmationToAdmin } = require("../create-payment-intent/vintageEmails");
        await sendVintageConfirmation(doc);
        await sendVintageConfirmationToAdmin(doc);
        doc.confirmacionEnviadaAt = new Date();
        await doc.save();
      } catch (e) {
        console.error(`[vintage PUT] error enviando confirmación ${doc.numeroOrden}:`, e.message);
      }
    }

    res.json({ message: "Pedido actualizado", data: doc });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/**
 * PUT /:id/configuracion — admin edita la solicitud del cliente.
 *
 * Recalcula el desglose y los totales con los mismos precios vivos que usa
 * el checkout (cotizarVintage + resolverZona), para que editar el pastel o
 * la entrega no deje el precio desfasado. Conserva lo ya cobrado: el
 * anticipo no se toca y el saldo se recalcula sobre el total nuevo.
 */
router.put("/:id/configuracion", checkRoleToken("admin"), async (req, res) => {
  try {
    const body = req.body || {};
    const doc = await Pedido.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Pedido no encontrado" });

    const sel = { ...(doc.seleccion || {}), ...(body.seleccion || {}) };
    const cot = await cotizarVintage(sel);
    if (cot.total <= 0) return res.status(400).json({ message: "No se pudo calcular el precio con esa configuración" });

    // Entrega (si viene). El costo de envío se resuelve por zona.
    const entrada = body.envio || {};
    const envio = {
      tipo:      entrada.tipo      ?? doc.envio?.tipo      ?? "recoger-local",
      colonia:   entrada.colonia   ?? doc.envio?.colonia   ?? "",
      municipio: entrada.municipio ?? doc.envio?.municipio ?? "",
      direccion: entrada.direccion ?? doc.envio?.direccion ?? "",
      hora:      entrada.hora      ?? doc.envio?.hora      ?? "",
      zona: "", costo: 0,
    };
    if (envio.tipo === "domicilio") {
      const z = resolverZona({ colonia: envio.colonia, municipio: envio.municipio });
      envio.zona = z.zona; envio.costo = z.costo;
    }

    const total = round2(cot.total + envio.costo);

    doc.seleccion      = { ...sel, porciones: cot.porciones };
    doc.desglose       = cot.items;
    doc.totalProductos = cot.total;
    doc.totalCosto     = cot.totalCosto;
    doc.envio          = envio;
    doc.total          = total;
    doc.precio         = total;
    doc.saldoPendiente = Math.max(round2(total - (Number(doc.anticipo) || 0)), 0);
    if (body.fecha !== undefined) doc.fecha = body.fecha || null;
    if (body.notas !== undefined) doc.notas = body.notas || "";
    if (body.cliente) doc.cliente = { ...doc.cliente.toObject?.() ?? doc.cliente, ...body.cliente };

    await doc.save();
    syncVintageCalendar(Pedido, doc);   // la fecha pudo cambiar

    res.json({ message: "Configuración actualizada", data: doc });
  } catch (e) {
    console.error("Error editando pedido vintage:", e);
    res.status(400).json({ message: e.message });
  }
});

// ── DELETE admin ─────────────────────────────────────────────────
router.delete("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const doc = await Pedido.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Pedido no encontrado" });
    res.json({ message: "Pedido eliminado" });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;
