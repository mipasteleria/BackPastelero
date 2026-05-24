const mongoose = require("mongoose");

/**
 * Pedido de Postres.
 *
 * Patrón análogo a galletaPedido pero más simple:
 *  - No hay cajas: los items son postres individuales con cantidad.
 *  - No hay stock: los postres se hornean bajo pedido, así que el
 *    webhook NO decrementa nada (a diferencia del galletaPedido).
 *  - Misma regla de entrega: 2 días hábiles + no domingos.
 *  - Snapshot principle: guardamos snapshot del nombre y precio por item
 *    para que el histórico no se altere si el admin edita el postre después.
 */

// ── Sub-schema: item del pedido ──────────────────────────────────────
const itemSchema = new mongoose.Schema(
  {
    postreId:        { type: mongoose.Schema.Types.ObjectId, ref: "Postre", required: true },
    slug:            { type: String, required: true },
    nombre:          { type: String, required: true },          // snapshot
    precioUnitario:  { type: Number, required: true, min: 0 },  // snapshot
    cantidad:        { type: Number, required: true, min: 1 },
    subtotal:        { type: Number, required: true, min: 0 },  // precioUnitario × cantidad
  },
  { _id: false }
);

// ── Sub-schema: dirección de envío (mismo shape que galletas) ────────
const direccionSchema = new mongoose.Schema(
  {
    calleNumero:  { type: String, default: "" },
    colonia:      { type: String, default: "" },
    municipio:    { type: String, default: "" },
    referencias:  { type: String, default: "" },
    zona:         { type: String, default: "" },
  },
  { _id: false }
);

const postrePedidoSchema = new mongoose.Schema(
  {
    // Número de orden global (formato distinto al de galletas para que en
    // el dashboard se distinga a simple vista). Único.
    numeroOrden:  { type: String, required: true, unique: true, index: true },
    consecutivo:  { type: Number, required: true },

    cliente: {
      nombre:    { type: String, required: true, trim: true },
      email:     { type: String, required: true, lowercase: true, trim: true },
      telefono:  { type: String, required: true, trim: true },
      userId:    { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    },

    items: {
      type: [itemSchema],
      required: true,
      validate: [(v) => v.length > 0, "Debe tener al menos un postre"],
    },

    subtotalProductos: { type: Number, required: true, min: 0 },
    costoEnvio:        { type: Number, default: 0, min: 0 },
    total:             { type: Number, required: true, min: 0 },

    tipoEntrega:   { type: String, required: true, enum: ["recogida", "envio"] },
    fechaEntrega:  { type: Date, required: true },
    horaEntrega:   { type: String, required: true },

    direccionEnvio: { type: direccionSchema, default: () => ({}) },

    notas: { type: String, default: "", maxlength: 500 },

    estadoPago: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    stripeSessionId:        { type: String, default: "" },
    stripePaymentIntentId:  { type: String, default: "" },

    estado: {
      type: String,
      enum: ["pendiente", "confirmado", "en_preparacion", "listo", "entregado", "cancelado"],
      default: "pendiente",
      index: true,
    },

    calendarEventId: { type: String, default: "" },

    notasInternas: {
      type: [require("./notaInternaSchema")],
      default: [],
    },
  },
  { timestamps: true }
);

postrePedidoSchema.index({ estado: 1, fechaEntrega: 1 });
postrePedidoSchema.index({ "cliente.email": 1, createdAt: -1 });

module.exports = mongoose.model("postrePedido", postrePedidoSchema);
