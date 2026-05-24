const mongoose = require("mongoose");

/**
 * Reseña verificada por compra.
 *
 * Solo se permite crear si el sistema puede probar que el usuario
 * compró el producto reseñado (controller hace la verificación contra
 * postrePedido o galletaPedido).
 *
 * Una reseña por usuario+producto (índice único). Es editable: si el
 * usuario reseña de nuevo el mismo producto, se actualiza en lugar de
 * crear una nueva (lógica en el controller).
 *
 * `visible` permite al admin ocultar reseñas spam/ofensivas sin
 * borrarlas (preserva historial). El listado público filtra por
 * `visible: true`.
 *
 * Snapshot: guardamos `usuario.nombre` y `producto.nombre` al crear
 * para que el listado público no haya que joinear con cada render.
 */
const resenaSchema = new mongoose.Schema(
  {
    // ── Usuario que escribió la reseña ──
    usuario: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
      nombre: { type: String, required: true, trim: true },
      email:  { type: String, required: true, lowercase: true, trim: true },
    },

    // ── Producto reseñado ──
    // tipo: "postre" → producto.productoId = Postre._id, slug = postre.slug
    // tipo: "galleta" → producto.productoId = GalletaSabor._id, slug = sabor.slug
    producto: {
      tipo: {
        type: String,
        required: true,
        enum: ["postre", "galleta"],
      },
      productoId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
      },
      slug:   { type: String, required: true },
      nombre: { type: String, required: true }, // snapshot
    },

    // ── Pedido que comprueba la compra ──
    // tipo: "postre" → pedidoId apunta a postrePedido
    // tipo: "galleta" → pedidoId apunta a galletaPedido
    pedido: {
      pedidoId: { type: mongoose.Schema.Types.ObjectId, required: true },
      tipo:     { type: String, required: true, enum: ["postre", "galleta"] },
      numeroOrden: { type: String, default: "" },
    },

    // ── Contenido de la reseña ──
    rating: {
      type: Number,
      required: true,
      min: [1, "Rating mínimo es 1"],
      max: [5, "Rating máximo es 5"],
    },
    texto: {
      type: String,
      default: "",
      trim: true,
      maxlength: [1000, "Texto demasiado largo (máx 1000 caracteres)"],
    },
    imagenUrl:      { type: String, default: "" },
    imagenFileName: { type: String, default: "" }, // para cleanup GCS

    // ── Moderación ──
    visible: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// 1 reseña por usuario+producto. El controller hace UPSERT.
// Usamos userId si está; si no, fallback a email (compras sin login).
resenaSchema.index({ "usuario.userId": 1, "producto.productoId": 1 }, { unique: true, sparse: true });
resenaSchema.index({ "usuario.email": 1, "producto.productoId": 1 });

// Listado público por producto (más usado).
resenaSchema.index({ "producto.productoId": 1, visible: 1, createdAt: -1 });

// Listado del home: rating + recencia.
resenaSchema.index({ visible: 1, rating: -1, createdAt: -1 });

module.exports = mongoose.model("Resena", resenaSchema);
