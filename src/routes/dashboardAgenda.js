const express = require("express");
const router = express.Router();
const checkRoleToken = require("../middlewares/myRoleToken");
const FechaBloqueada = require("../models/fechaBloqueada");
const GalletaPedido = require("../models/galletaPedido");
const PostrePedido = require("../models/postrePedido");
const VintagePedido = require("../models/vintage/pedido");
const Cotizacion = require("../models/cotizacionPersonalizada");

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ── Fechas bloqueadas ─────────────────────────────────────────────
router.get("/fechas-bloqueadas", async (_req, res) => {
  try {
    const docs = await FechaBloqueada.find().sort({ fecha: 1 });
    res.json({ data: docs.map((d) => ({ fecha: d.fecha, motivo: d.motivo })) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post("/fechas-bloqueadas", checkRoleToken("admin"), async (req, res) => {
  try {
    const { fecha, motivo } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return res.status(400).json({ message: "Fecha inválida" });
    const doc = await FechaBloqueada.findOneAndUpdate({ fecha }, { fecha, motivo: motivo || "" }, { upsert: true, new: true });
    res.json({ message: "Fecha bloqueada", data: doc });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete("/fechas-bloqueadas/:fecha", checkRoleToken("admin"), async (req, res) => {
  try {
    await FechaBloqueada.deleteOne({ fecha: req.params.fecha });
    res.json({ message: "Fecha desbloqueada" });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

/** ¿Está bloqueada esta fecha? (para usar en los checkouts) */
async function esFechaBloqueada(fecha) {
  if (!fecha) return false;
  const iso = new Date(fecha).toISOString().slice(0, 10);
  return !!(await FechaBloqueada.exists({ fecha: iso }));
}

// ── Agenda + analíticos del mes ───────────────────────────────────
// GET /dashboard-agenda?mes=YYYY-MM  (admin)
router.get("/dashboard-agenda", checkRoleToken("admin"), async (req, res) => {
  try {
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || "") ? req.query.mes : new Date().toISOString().slice(0, 7);
    const ini = new Date(`${mes}-01T00:00:00.000Z`);
    const fin = new Date(ini); fin.setUTCMonth(fin.getUTCMonth() + 1);

    const enMes = (campo) => ({ [campo]: { $gte: ini, $lt: fin } });
    const diaISO = (d) => new Date(d).toISOString().slice(0, 10);

    const [galletas, postres, vintage, cotizaciones, bloqueadas] = await Promise.all([
      GalletaPedido.find({ ...enMes("fechaEntrega"), estadoPago: "paid" }),
      PostrePedido.find({ ...enMes("fechaEntrega"), estadoPago: "paid" }),
      VintagePedido.find({ ...enMes("fecha"), status: { $regex: /^(Agendado|Entregado)/ } }),
      Cotizacion.find({ ...enMes("evento.fecha"), status: { $regex: /^(Agendado|Entregado)/ } }),
      FechaBloqueada.find({ fecha: { $gte: `${mes}-01`, $lt: fin.toISOString().slice(0, 10) } }),
    ]);

    // ── Eventos por día para el calendario ──
    const eventos = [
      ...galletas.map((p) => ({ dia: diaISO(p.fechaEntrega), tipo: "galletas", icono: "🍪", id: String(p._id), numeroOrden: p.numeroOrden, cliente: p.cliente?.nombre, hora: p.horaEntrega || "", total: p.total })),
      ...postres.map((p) => ({ dia: diaISO(p.fechaEntrega), tipo: "postres", icono: "🍮", id: String(p._id), numeroOrden: p.numeroOrden, cliente: p.cliente?.nombre, hora: p.horaEntrega || "", total: p.total })),
      ...vintage.map((p) => ({ dia: diaISO(p.fecha), tipo: "vintage", icono: "🎀", id: String(p._id), numeroOrden: p.numeroOrden, cliente: p.cliente?.nombre, hora: p.envio?.hora || "", total: p.total })),
      ...cotizaciones.map((p) => ({
        dia: diaISO(p.evento.fecha), tipo: "cotizacion",
        icono: p.tipoProducto === "cupcake" ? "🧁" : p.tipoProducto === "mesa-postres" ? "🍰" : "🎂",
        id: String(p._id), numeroOrden: p.numeroOrden, cliente: p.cliente?.nombre, hora: p.entrega?.hora || "", total: p.precio || 0,
      })),
    ];

    // ── Analíticos del mes ──
    // Ingresos (ganancia bruta) = ventas confirmadas del mes.
    const ingresos = round2(
      galletas.reduce((s, p) => s + (p.total || 0), 0) +
      postres.reduce((s, p) => s + (p.total || 0), 0) +
      vintage.reduce((s, p) => s + (p.total || 0), 0) +
      cotizaciones.reduce((s, p) => s + (p.precio || 0), 0)
    );
    // Costos conocidos: vintage.totalCosto + costeoSnapshot.costoTotal de
    // cotizaciones. Galletas/postres no registran costo — se reporta la
    // cobertura para transparencia.
    const costos = round2(
      vintage.reduce((s, p) => s + (p.totalCosto || 0), 0) +
      cotizaciones.reduce((s, p) => s + (p.costeoSnapshot?.costoTotal || 0), 0)
    );
    const ingresosConCosto = round2(
      vintage.reduce((s, p) => s + (p.total || 0), 0) +
      cotizaciones.filter((p) => p.costeoSnapshot?.costoTotal).reduce((s, p) => s + (p.precio || 0), 0)
    );
    const gananciaNeta = round2(ingresosConCosto - costos);

    // ── Top productos vendidos ──
    const conteo = {};
    const add = (nombre, cant, icono) => {
      if (!nombre) return;
      const k = `${icono} ${nombre}`;
      conteo[k] = (conteo[k] || 0) + cant;
    };
    galletas.forEach((p) => (p.cajas || []).forEach((c) => (c.items || []).forEach((it) => add(it.saborNombre, it.cantidad, "🍪"))));
    postres.forEach((p) => (p.items || []).forEach((it) => add(it.nombre, it.cantidad, "🍮")));
    vintage.forEach(() => add("Pastel Vintage", 1, "🎀"));
    cotizaciones.forEach((p) => add(
      p.tipoProducto === "cupcake" ? "Cupcakes personalizados" : p.tipoProducto === "mesa-postres" ? "Mesa de postres" : "Pastel personalizado",
      1,
      p.tipoProducto === "cupcake" ? "🧁" : p.tipoProducto === "mesa-postres" ? "🍰" : "🎂"
    ));
    const topProductos = Object.entries(conteo).map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad).slice(0, 8);

    res.json({
      data: {
        mes, eventos,
        bloqueadas: bloqueadas.map((b) => ({ fecha: b.fecha, motivo: b.motivo })),
        analytics: {
          pedidos: eventos.length,
          ingresos,               // ganancia bruta (ventas del mes)
          costos,                 // costos conocidos (vintage + cotizaciones costeadas)
          gananciaNeta,           // sobre los pedidos con costo registrado
          ingresosConCosto,       // base de la neta (transparencia)
          topProductos,
        },
      },
    });
  } catch (e) {
    console.error("[dashboard-agenda]", e);
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
module.exports.esFechaBloqueada = esFechaBloqueada;
