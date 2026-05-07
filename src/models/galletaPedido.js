const mongoose = require("mongoose");

/**
 * Pedido de Galletas NY.
 *
 * No requiere usuario registrado para recogida en sucursal — el cliente
 * solo da nombre/email/teléfono. Para envío sí debe registrarse (validado
 * en el frontend; si llega `userId` lo guardamos como referencia, pero el
 * pedido se mantiene íntegro con los datos de contacto en `cliente`).
 *
 * El stock se descuenta al confirmarse el pago (webhook de Stripe) — NO
 * en la creación del pedido. Esto evita "phantom holds" si el cliente
 * abandona el checkout.
 *
 * Snapshot principle: guardamos `saborNombre` y `precioUnitario` en cada
 * item. Si el admin cambia el precio o renombra un sabor después, el
 * pedido histórico no se altera.
 */

// ── Sub-schema: item dentro de una caja ──────────────────────────────
const itemSchema = new mongoose.Schema(
  {
    saborSlug:       { type: String, required: true },
    saborNombre:     { type: String, required: true },
    cantidad:        { type: Number, required: true, min: 1 },
    precioUnitario:  { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

// ── Sub-schema: caja completa ────────────────────────────────────────
const cajaSchema = new mongoose.Schema(
  {
    tamano:    { type: String, required: true, enum: ["6", "12"] },
    items:     { type: [itemSchema], required: true },
    subtotal:  { type: Number, required: true, min: 0 },
    descuento: { type: Number, default: 0, min: 0 },
    total:     { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

// ── Sub-schema: dirección de envío ───────────────────────────────────
const direccionSchema = new mongoose.Schema(
  {
    calleNumero:  { type: String, default: "" },
    colonia:      { type: String, default: "" },
    municipio:    { type: String, default: "" },
    referencias:  { type: String, default: "" },
    zona:         { type: String, default: "" },   // "Z1" | "Z2" | "Z3" | "Z4"
  },
  { _id: false }
);

// ── Schema principal ─────────────────────────────────────────────────
const galletaPedidoSchema = new mongoose.Schema(
  {
    // Número de orden global (formato GNY-DDMMMYY-NNNN). Único.
    numeroOrden:  { type: String, required: true, unique: true, index: true },
    consecutivo:  { type: Number, required: true },

    // Datos del cliente — siempre presentes (incluso si está logueado)
    cliente: {
      nombre:    { type: String, required: true, trim: true },
      email:     { type: String, required: true, lowercase: true, trim: true },
      telefono:  { type: String, required: true, trim: true },
      userId:    { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    },

    // Contenido del pedido
    cajas: { type: [cajaSchema], required: true, validate: [v => v.length > 0, "Debe tener al menos una caja"] },

    subtotalProductos: { type: Number, required: true, min: 0 },
    costoEnvio:        { type: Number, default: 0, min: 0 },
    total:             { type: Number, required: true, min: 0 },

    // Logística
    tipoEntrega:   { type: String, required: true, enum: ["recogida", "envio"] },
    fechaEntrega:  { type: Date, required: true },
    horaEntrega:   { type: String, required: true },         // "11:00 AM" — guardado como string para evitar TZ issues

    direccionEnvio: { type: direccionSchema, default: () => ({}) },

    notas: { type: String, default: "", maxlength: 500 },

    // Pago
    estadoPago: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    stripeSessionId:        { type: String, default: "" },
    stripePaymentIntentId:  { type: String, default: "" },

    // Estado operativo del pedido
    estado: {
      type: String,
      enum: ["pendiente", "confirmado", "en_preparacion", "listo", "entregado", "cancelado"],
      default: "pendiente",
      index: true,
    },

    // Trazabilidad de stock — se pone true cuando ya se descontó del inventario
    stockDescontado: { type: Boolean, default: false },

    // Google Calendar
    calendarEventId: { type: String, default: "" },
  },
  { timestamps: true }
);

// Index compuesto para listar pedidos por estado + fecha eficientemente
galletaPedidoSchema.index({ estado: 1, fechaEntrega: 1 });
galletaPedidoSchema.index({ "cliente.email": 1, createdAt: -1 });

module.exports = mongoose.model("galletaPedido", galletaPedidoSchema);
