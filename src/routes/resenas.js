const express = require("express");
const router = express.Router();
const { Storage } = require("@google-cloud/storage");

const Resena = require("../models/resena");
const Postre = require("../models/postre");
const GalletaSabor = require("../models/galletaSabor");
const PostrePedido = require("../models/postrePedido");
const GalletaPedido = require("../models/galletaPedido");
const checkRoleToken = require("../middlewares/myRoleToken");
const { requireAuth } = checkRoleToken;

// Cliente GCS local para cleanup de imágenes de reseña (mismo patrón
// que homeConfig.js y postres.js).
let gcs = null;
try {
  const credentials = process.env.GCS_CREDENTIALS ? JSON.parse(process.env.GCS_CREDENTIALS) : undefined;
  gcs = new Storage({ projectId: process.env.PROJECT_ID, credentials });
} catch (e) {
  console.error("[resenas] GCS init failed — cleanup disabled:", e.message);
}
const BUCKET = process.env.BUCKET_NAME;

async function borrarArchivoGCS(fileName) {
  if (!gcs || !BUCKET || !fileName) return;
  try {
    await gcs.bucket(BUCKET).file(fileName).delete({ ignoreNotFound: true });
  } catch (e) {
    console.error(`[resenas] No se pudo borrar archivo ${fileName}:`, e.message);
  }
}

/**
 * Verifica que el usuario haya comprado el producto. Devuelve el primer
 * pedido `confirmado` (o `estadoPago: paid`) que coincida con el
 * userId/email + producto. Si no hay match, retorna null.
 */
async function verificarCompra({ tipo, productoId, productoSlug, userId, email }) {
  const baseFiltro = {
    $or: [
      { estado: "confirmado" }, { estado: "en_preparacion" },
      { estado: "listo" },       { estado: "entregado" },
      { estadoPago: "paid" },
    ],
  };
  // Match por userId o email (snapshot del cliente en el pedido).
  const matchCliente = userId
    ? { $or: [{ "cliente.userId": userId }, { "cliente.email": (email || "").toLowerCase() }] }
    : { "cliente.email": (email || "").toLowerCase() };

  if (tipo === "postre") {
    return PostrePedido.findOne({
      ...baseFiltro,
      ...matchCliente,
      "items.postreId": productoId,
    }).select("_id numeroOrden");
  }
  if (tipo === "galleta") {
    // Galletas se referencian por slug (no por sabor._id) en los pedidos.
    return GalletaPedido.findOne({
      ...baseFiltro,
      ...matchCliente,
      "cajas.items.saborSlug": productoSlug,
    }).select("_id numeroOrden");
  }
  return null;
}

/**
 * GET /resenas/producto/:tipo/:productoId — público.
 * Lista las reseñas visibles para un producto + agregados (promedio,
 * total). Para galletas, `:productoId` también acepta el slug.
 */
router.get("/producto/:tipo/:productoId", async (req, res) => {
  try {
    const { tipo, productoId } = req.params;
    if (!["postre", "galleta"].includes(tipo)) {
      return res.status(400).json({ message: "tipo debe ser 'postre' o 'galleta'" });
    }

    // Resolver productoId vs slug (acepta ambos para galletas).
    let prodId = productoId;
    let prodSlug = productoId;
    const esObjectId = /^[0-9a-fA-F]{24}$/.test(productoId);

    if (tipo === "postre") {
      if (!esObjectId) {
        const p = await Postre.findOne({ slug: productoId }).select("_id");
        if (!p) return res.json({ data: [], rating: { promedio: 0, total: 0 } });
        prodId = p._id;
      }
    } else { // galleta
      if (!esObjectId) {
        const s = await GalletaSabor.findOne({ slug: productoId }).select("_id");
        if (!s) return res.json({ data: [], rating: { promedio: 0, total: 0 } });
        prodId = s._id;
      } else {
        const s = await GalletaSabor.findById(productoId).select("slug");
        if (s) prodSlug = s.slug;
      }
    }

    const resenas = await Resena.find({
      "producto.productoId": prodId,
      visible: true,
    }).sort({ createdAt: -1 }).limit(100);

    const total = resenas.length;
    const promedio = total > 0
      ? Math.round((resenas.reduce((s, r) => s + r.rating, 0) / total) * 10) / 10
      : 0;

    res.json({
      data: resenas,
      rating: { promedio, total },
    });
  } catch (e) {
    console.error("Error listando reseñas:", e);
    res.status(500).json({ message: e.message });
  }
});

/**
 * GET /resenas/destacadas — público.
 * Reseñas para mostrar en el home: visibles, rating 5, las más recientes.
 * `?limit=N` (default 3).
 */
router.get("/destacadas", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 3, 20);
    const resenas = await Resena.find({ visible: true, rating: 5 })
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json({ data: resenas });
  } catch (e) {
    console.error("Error obteniendo reseñas destacadas:", e);
    res.status(500).json({ message: e.message });
  }
});

/**
 * GET /resenas/mias — auth requerida.
 * Las reseñas del usuario logueado (útil para "mis reseñas" en perfil).
 */
router.get("/mias", requireAuth, async (req, res) => {
  try {
    const userId = req.user?._id;
    const email = (req.user?.email || "").toLowerCase();
    const filter = userId
      ? { $or: [{ "usuario.userId": userId }, { "usuario.email": email }] }
      : { "usuario.email": email };
    const resenas = await Resena.find(filter).sort({ createdAt: -1 });
    res.json({ data: resenas });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/**
 * POST /resenas — auth requerida.
 * Crea o actualiza una reseña (UPSERT por usuario+producto). Verifica
 * la compra antes de aceptar.
 *
 * Body: { tipo, productoId, rating, texto?, imagenUrl?, imagenFileName? }
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user?._id;
    const userNombre = req.user?.name || "";
    const userEmail  = (req.user?.email || "").toLowerCase();
    if (!userId || !userEmail) {
      return res.status(401).json({ message: "Autenticación inválida" });
    }

    const { tipo, productoId, rating, texto, imagenUrl, imagenFileName } = req.body || {};
    if (!["postre", "galleta"].includes(tipo)) {
      return res.status(400).json({ message: "tipo debe ser 'postre' o 'galleta'" });
    }
    if (!productoId) return res.status(400).json({ message: "productoId es requerido" });
    const ratingNum = Number(rating);
    if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ message: "rating debe ser un entero entre 1 y 5" });
    }

    // Cargar el producto para snapshot del nombre + slug.
    let prod;
    if (tipo === "postre") {
      prod = await Postre.findById(productoId).select("_id slug nombre");
    } else {
      prod = await GalletaSabor.findById(productoId).select("_id slug nombre");
    }
    if (!prod) return res.status(404).json({ message: "Producto no encontrado" });

    // Verificar compra.
    const pedido = await verificarCompra({
      tipo,
      productoId: prod._id,
      productoSlug: prod.slug,
      userId,
      email: userEmail,
    });
    if (!pedido) {
      return res.status(403).json({
        message: "No encontramos una compra confirmada de este producto en tu cuenta. Solo clientes verificados pueden reseñar.",
      });
    }

    // UPSERT: si ya existe reseña del mismo usuario+producto, actualizar.
    const filtroExistente = {
      "producto.productoId": prod._id,
      $or: [
        { "usuario.userId": userId },
        { "usuario.email": userEmail },
      ],
    };
    const existente = await Resena.findOne(filtroExistente);

    if (existente) {
      // Si la imagen cambió, borrar la vieja de GCS.
      const fileNamePrevio = existente.imagenFileName || "";
      existente.rating = ratingNum;
      existente.texto = (texto || "").trim().slice(0, 1000);
      if (typeof imagenUrl === "string") existente.imagenUrl = imagenUrl;
      if (typeof imagenFileName === "string") existente.imagenFileName = imagenFileName;
      await existente.save();
      if (fileNamePrevio && fileNamePrevio !== existente.imagenFileName) {
        borrarArchivoGCS(fileNamePrevio);
      }
      return res.json({ message: "Reseña actualizada", data: existente });
    }

    const nueva = await Resena.create({
      usuario: {
        userId,
        nombre: userNombre,
        email:  userEmail,
      },
      producto: {
        tipo,
        productoId: prod._id,
        slug:       prod.slug,
        nombre:     prod.nombre,
      },
      pedido: {
        pedidoId:    pedido._id,
        tipo,
        numeroOrden: pedido.numeroOrden || "",
      },
      rating: ratingNum,
      texto: (texto || "").trim().slice(0, 1000),
      imagenUrl: imagenUrl || "",
      imagenFileName: imagenFileName || "",
    });

    res.status(201).json({ message: "Reseña creada", data: nueva });
  } catch (e) {
    console.error("Error creando reseña:", e);
    res.status(400).json({ message: e.message });
  }
});

/**
 * DELETE /resenas/:id — auth requerida (dueño o admin).
 * Borra reseña + imagen de GCS.
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const resena = await Resena.findById(req.params.id);
    if (!resena) return res.status(404).json({ message: "Reseña no encontrada" });

    const esAdmin = req.user?.role === "admin";
    const esDueno = resena.usuario.userId && String(resena.usuario.userId) === String(req.user?._id);
    if (!esAdmin && !esDueno) {
      return res.status(403).json({ message: "No tienes permiso para borrar esta reseña" });
    }

    if (resena.imagenFileName) borrarArchivoGCS(resena.imagenFileName);
    await Resena.findByIdAndDelete(resena._id);
    res.json({ message: "Reseña eliminada" });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/**
 * PATCH /resenas/:id/visible — admin.
 * Toggle visible para moderación. Soporta body { visible: true/false }.
 */
router.patch("/:id/visible", checkRoleToken("admin"), async (req, res) => {
  try {
    const { visible } = req.body || {};
    if (typeof visible !== "boolean") {
      return res.status(400).json({ message: "visible debe ser boolean" });
    }
    const resena = await Resena.findByIdAndUpdate(
      req.params.id,
      { visible },
      { new: true }
    );
    if (!resena) return res.status(404).json({ message: "Reseña no encontrada" });
    res.json({ message: "Visibilidad actualizada", data: resena });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/**
 * GET /resenas/admin — admin: listar todas (incluyendo ocultas).
 * Útil para el dashboard de moderación.
 */
router.get("/admin", checkRoleToken("admin"), async (req, res) => {
  try {
    const filter = {};
    if (req.query.visible === "true")  filter.visible = true;
    if (req.query.visible === "false") filter.visible = false;
    if (req.query.tipo) filter["producto.tipo"] = req.query.tipo;
    const resenas = await Resena.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit) || 500);
    res.json({ data: resenas });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
