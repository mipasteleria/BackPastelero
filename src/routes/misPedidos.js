const express = require("express");
const router = express.Router();
const checkRoleToken = require("../middlewares/myRoleToken");
const { requireAuth } = checkRoleToken;

const CotizacionPersonalizada = require("../models/cotizacionPersonalizada");
const GalletaPedido = require("../models/galletaPedido");
const PostrePedido = require("../models/postrePedido");
const VintagePedido = require("../models/vintage/pedido");

/**
 * GET /mis-pedidos — historial del cliente en una sola llamada.
 *
 * Devuelve dos listas:
 *  - `cotizaciones`: sus cotizaciones personalizadas, con el publicToken
 *    para abrir la vista real (/cotizacion/ver/:token). Antes esta pantalla
 *    leía los modelos legacy y no mostraba las cotizaciones nuevas.
 *  - `compras`: pedidos de precio fijo (galletas NY, postres y vintage) con
 *    qué compró y cuánto pagó.
 *
 * Retención: las compras solo se listan durante MESES_COMPRAS meses, como
 * se informa en los términos y condiciones. El dato no se borra aquí — esto
 * únicamente acota lo que el cliente ve en su historial.
 *
 * Se busca por userId y también por email, para que las compras hechas como
 * invitado con el mismo correo aparezcan al iniciar sesión.
 */

const MESES_COMPRAS = 18;

function desdeHace(meses) {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d;
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = String(req.user._id || "");
    const email = String(req.user.email || "").toLowerCase().trim();
    const desde = desdeHace(MESES_COMPRAS);

    // Coincidencia por cuenta o por correo (compras como invitado).
    const dueño = (campoUser, campoEmail) => {
      const o = [];
      if (userId) o.push({ [campoUser]: userId });
      if (email) o.push({ [campoEmail]: email });
      return o.length ? { $or: o } : { _id: null };
    };

    const [cotizaciones, galletas, postres, vintage] = await Promise.all([
      CotizacionPersonalizada.find(dueño("userId", "cliente.email"))
        .select("numeroOrden tipoProducto status precio anticipo saldoPendiente evento entrega publicToken validUntil createdAt")
        .sort({ createdAt: -1 }),
      GalletaPedido.find({ ...dueño("cliente.userId", "cliente.email"), estadoPago: "paid", createdAt: { $gte: desde } })
        .select("numeroOrden cajas total fechaEntrega estado createdAt")
        .sort({ createdAt: -1 }),
      PostrePedido.find({ ...dueño("cliente.userId", "cliente.email"), estadoPago: "paid", createdAt: { $gte: desde } })
        .select("numeroOrden items total fechaEntrega estado createdAt")
        .sort({ createdAt: -1 }),
      VintagePedido.find({ ...dueño("userId", "cliente.email"), createdAt: { $gte: desde }, status: { $not: /^Pendiente$/ } })
        .select("numeroOrden total anticipo saldoPendiente fecha status publicToken createdAt")
        .sort({ createdAt: -1 }),
    ]);

    // Resumen legible de qué se compró, para no exponer estructura interna.
    const compras = [
      ...galletas.map((p) => ({
        tipo: "galletas",
        icono: "🍪",
        titulo: "Galletas NY",
        detalle: (p.cajas || [])
          .flatMap((c) => (c.items || []).map((it) => `${it.cantidad}× ${it.saborNombre}`))
          .join(", "),
        numeroOrden: p.numeroOrden,
        total: p.total,
        fecha: p.fechaEntrega,
        estado: p.estado,
        createdAt: p.createdAt,
      })),
      ...postres.map((p) => ({
        tipo: "postres",
        icono: "🍮",
        titulo: "Postres",
        detalle: (p.items || []).map((it) => `${it.cantidad}× ${it.nombre}`).join(", "),
        numeroOrden: p.numeroOrden,
        total: p.total,
        fecha: p.fechaEntrega,
        estado: p.estado,
        createdAt: p.createdAt,
      })),
      ...vintage.map((p) => ({
        tipo: "vintage",
        icono: "🎀",
        titulo: "Pastel Vintage",
        detalle: "Pastel armado a tu medida",
        numeroOrden: p.numeroOrden,
        total: p.total,
        saldoPendiente: p.saldoPendiente,
        fecha: p.fecha,
        estado: p.status,
        publicToken: p.publicToken,
        createdAt: p.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      data: { cotizaciones, compras },
      retencionComprasMeses: MESES_COMPRAS,
    });
  } catch (e) {
    console.error("Error en /mis-pedidos:", e);
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
module.exports.MESES_COMPRAS = MESES_COMPRAS;
