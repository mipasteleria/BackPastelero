const express = require("express");
const router = express.Router();
const VentaMostrador = require("../models/ventaMostrador");
const GalletaSabor = require("../models/galletaSabor");
const Postre = require("../models/postre");
const Receta = require("../models/recetas/recetas");
const Cost = require("../models/costs");
const { generarNumeroOrden } = require("../utils/orderNumber");
const checkRoleToken = require("../middlewares/myRoleToken");

// El punto de venta lo operan admin y personal de mostrador.
const MOSTRADOR = checkRoleToken(["admin", "empleado"]);
// Reportes y cancelaciones: solo admin.
const SOLO_ADMIN = checkRoleToken("admin");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * GET /ventas-mostrador/catalogo — lo que se puede cobrar hoy.
 *
 * Devuelve nombre, precio y stock. NO devuelve costos: lo consulta la
 * pantalla que opera el personal de mostrador, que no debe verlos.
 */
router.get("/catalogo", MOSTRADOR, async (req, res) => {
  try {
    const [galletas, postres] = await Promise.all([
      GalletaSabor.find({ activo: true }).select("slug nombre precio stock emoji imagen").sort({ orden: 1 }).lean(),
      Postre.find({ activo: true }).select("slug nombre precio imagenUrl categoria unidad").sort({ orden: 1 }).lean(),
    ]);
    res.json({
      data: {
        galletas: galletas.map((g) => ({
          tipo: "galleta-ny", refId: g._id, slug: g.slug, nombre: g.nombre,
          precio: g.precio, stock: g.stock, emoji: g.emoji, imagen: g.imagen || "",
        })),
        postres: postres.map((p) => ({
          tipo: "postre", refId: p._id, slug: p.slug, nombre: p.nombre,
          precio: p.precio, stock: null, imagen: p.imagenUrl || "",
          categoria: p.categoria || "postre", unidad: p.unidad || "pieza",
        })),
      },
    });
  } catch (e) {
    console.error("[ventas-mostrador] catálogo:", e);
    res.status(500).json({ message: e.message });
  }
});

/** Costo unitario de un producto, para congelarlo en la venta. */
async function costoUnitarioDe(item, cfg) {
  try {
    if (item.tipo === "galleta-ny") {
      const g = await GalletaSabor.findById(item.refId).select("recetaId costoUnitarioSnapshot costoManual").lean();
      if (!g) return null;
      if (g.recetaId) {
        const r = await Receta.findById(g.recetaId).select("total_cost portions").lean();
        if (r?.portions > 0) return round2(r.total_cost / r.portions + (cfg?.costoBrandingPorGalleta || 0));
      }
      return g.costoUnitarioSnapshot ?? null;
    }
    if (item.tipo === "postre") {
      const p = await Postre.findById(item.refId).select("recetaId cantidadReceta costoEmpaque").lean();
      if (!p?.recetaId) return null;
      const r = await Receta.findById(p.recetaId).select("total_cost portions").lean();
      if (!(r?.portions > 0)) return null;
      const mp = (r.total_cost / r.portions) * (Number(p.cantidadReceta) || 1);
      return round2(mp + (cfg?.costoBrandingPorPostre || 0) + (Number(p.costoEmpaque) || 0));
    }
  } catch (e) {
    console.error("[ventas-mostrador] costo:", e.message);
  }
  return null; // conceptos libres, o producto sin receta
}

/**
 * POST /ventas-mostrador — registrar una venta.
 *
 * El cobro ya ocurrió (efectivo en caja o terminal de Mercado Pago);
 * esto solo lo registra. El stock de Galletas NY se descuenta de forma
 * atómica con $inc condicionado, para que dos cajas vendiendo a la vez
 * no puedan dejarlo en negativo.
 */
router.post("/", MOSTRADOR, async (req, res) => {
  const descontados = [];
  try {
    const body = req.body || {};
    const entrada = Array.isArray(body.items) ? body.items : [];
    if (entrada.length === 0) {
      return res.status(400).json({ message: "La venta no tiene productos" });
    }
    if (!["efectivo", "terminal"].includes(body.metodoPago)) {
      return res.status(400).json({ message: "Método de pago inválido" });
    }

    const cfg = await Cost.findOne().lean();

    // ── Armar los renglones con precio y costo del servidor ──
    // El precio NO se toma del cliente para los productos de catálogo:
    // si viniera del navegador, cualquiera podría cobrarse lo que
    // quisiera. Solo el concepto libre trae precio capturado a mano.
    const items = [];
    for (const it of entrada) {
      const cantidad = Math.max(1, Math.floor(Number(it.cantidad) || 0));
      if (it.tipo === "libre") {
        const precio = Number(it.precioUnitario);
        if (!Number.isFinite(precio) || precio < 0) {
          return res.status(400).json({ message: "El concepto libre necesita un precio válido" });
        }
        const nombre = String(it.nombre || "").trim();
        if (!nombre) return res.status(400).json({ message: "El concepto libre necesita un nombre" });
        items.push({ tipo: "libre", refId: null, slug: "", nombre, precioUnitario: round2(precio), cantidad, subtotal: round2(precio * cantidad), costoUnitario: null });
        continue;
      }

      const Modelo = it.tipo === "galleta-ny" ? GalletaSabor : Postre;
      const doc = await Modelo.findById(it.refId).lean();
      if (!doc || doc.activo === false) {
        return res.status(400).json({ message: `Producto no disponible: ${it.nombre || it.refId}` });
      }
      const costoUnitario = await costoUnitarioDe({ tipo: it.tipo, refId: it.refId }, cfg);
      items.push({
        tipo: it.tipo, refId: doc._id, slug: doc.slug, nombre: doc.nombre,
        precioUnitario: round2(doc.precio), cantidad,
        subtotal: round2(doc.precio * cantidad), costoUnitario,
      });
    }

    const subtotal = round2(items.reduce((a, i) => a + i.subtotal, 0));
    const descuento = Math.max(0, round2(Number(body.descuento) || 0));
    const total = round2(Math.max(0, subtotal - descuento));

    if (body.metodoPago === "efectivo" && body.efectivoRecibido != null) {
      const recibido = Number(body.efectivoRecibido);
      if (Number.isFinite(recibido) && recibido < total) {
        return res.status(400).json({ message: "El efectivo recibido es menor que el total" });
      }
    }

    // ── Descontar stock de galletas, atómico ──
    // El filtro `stock: { $gte: cantidad }` hace que la resta solo se
    // aplique si alcanza; si otra caja vendió primero, no entra y se
    // devuelve el error en vez de dejar stock negativo.
    for (const it of items.filter((i) => i.tipo === "galleta-ny")) {
      const r = await GalletaSabor.updateOne(
        { _id: it.refId, stock: { $gte: it.cantidad } },
        { $inc: { stock: -it.cantidad } }
      );
      if (r.modifiedCount !== 1) {
        // Revertir lo ya descontado de esta misma venta.
        for (const prev of descontados) {
          await GalletaSabor.updateOne({ _id: prev.refId }, { $inc: { stock: prev.cantidad } });
        }
        return res.status(409).json({ message: `Sin stock suficiente de ${it.nombre}` });
      }
      descontados.push(it);
    }

    const { numeroOrden, consecutivo } = await generarNumeroOrden("MOS");

    const venta = await VentaMostrador.create({
      numeroOrden, consecutivo, items, subtotal, descuento, total,
      metodoPago: body.metodoPago,
      efectivoRecibido: body.metodoPago === "efectivo" && body.efectivoRecibido != null ? round2(body.efectivoRecibido) : null,
      cambio: body.metodoPago === "efectivo" && body.efectivoRecibido != null ? round2(Number(body.efectivoRecibido) - total) : null,
      referencia: String(body.referencia || "").trim(),
      vendidoPor: req.user?._id || null,
      vendidoPorNombre: req.user?.name || "",
      clienteNombre: String(body.clienteNombre || "").trim(),
      notas: String(body.notas || "").trim(),
    });

    res.status(201).json({ message: "Venta registrada", data: venta });
  } catch (e) {
    // Si algo falló después de descontar, se devuelve el stock.
    for (const prev of descontados) {
      await GalletaSabor.updateOne({ _id: prev.refId }, { $inc: { stock: prev.cantidad } }).catch(() => {});
    }
    console.error("[ventas-mostrador] crear:", e);
    res.status(400).json({ message: e.message });
  }
});

/**
 * GET /ventas-mostrador — ventas de un día (default hoy).
 * El personal de mostrador ve las suyas; el admin ve todas.
 */
router.get("/", MOSTRADOR, async (req, res) => {
  try {
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dia || "")
      ? req.query.dia
      : new Date().toISOString().slice(0, 10);
    const ini = new Date(`${dia}T00:00:00.000Z`);
    const fin = new Date(ini); fin.setUTCDate(fin.getUTCDate() + 1);

    const filtro = { createdAt: { $gte: ini, $lt: fin } };
    if (req.user?.role !== "admin") filtro.vendidoPor = req.user?._id;

    const ventas = await VentaMostrador.find(filtro).sort({ createdAt: -1 }).lean();
    const vivas = ventas.filter((v) => !v.cancelada);

    res.json({
      data: ventas,
      corte: {
        dia,
        ventas: vivas.length,
        efectivo: round2(vivas.filter((v) => v.metodoPago === "efectivo").reduce((a, v) => a + v.total, 0)),
        terminal: round2(vivas.filter((v) => v.metodoPago === "terminal").reduce((a, v) => a + v.total, 0)),
        total: round2(vivas.reduce((a, v) => a + v.total, 0)),
      },
    });
  } catch (e) {
    console.error("[ventas-mostrador] listar:", e);
    res.status(500).json({ message: e.message });
  }
});

/**
 * PUT /ventas-mostrador/:id/cancelar — solo admin.
 * No borra: marca cancelada y regresa el stock.
 */
router.put("/:id/cancelar", SOLO_ADMIN, async (req, res) => {
  try {
    const venta = await VentaMostrador.findById(req.params.id);
    if (!venta) return res.status(404).json({ message: "Venta no encontrada" });
    if (venta.cancelada) return res.status(400).json({ message: "Esa venta ya estaba cancelada" });

    for (const it of venta.items.filter((i) => i.tipo === "galleta-ny")) {
      await GalletaSabor.updateOne({ _id: it.refId }, { $inc: { stock: it.cantidad } });
    }

    venta.cancelada = true;
    venta.canceladaMotivo = String(req.body?.motivo || "").trim();
    venta.canceladaAt = new Date();
    await venta.save();

    res.json({ message: "Venta cancelada y stock devuelto", data: venta });
  } catch (e) {
    console.error("[ventas-mostrador] cancelar:", e);
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;
