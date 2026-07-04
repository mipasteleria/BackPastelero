const mongoose = require("mongoose");
const notaInternaSchema = require("../notaInternaSchema");

/**
 * Pedido de Pastel Vintage. Producto configurable con total cerrado.
 * Guarda la selección (snapshot), el desglose de costeo (costo/precio/
 * margen por aspecto, para el admin) y el envío.
 */
const desgloseSchema = new mongoose.Schema(
  { concepto: String, costo: Number, margen: Number, precio: Number },
  { _id: false }
);

const pedidoVintageSchema = new mongoose.Schema(
  {
    numeroOrden: { type: String, default: "" },
    userId: { type: String, default: "" },

    seleccion: { type: mongoose.Schema.Types.Mixed, default: {} }, // slugs + decoraciones + notas + porciones
    desglose: { type: [desgloseSchema], default: [] },
    totalProductos: { type: Number, default: 0 },
    totalCosto: { type: Number, default: 0 },

    envio: {
      tipo:      { type: String, default: "recoger-local" }, // recoger-local | domicilio
      zona:      { type: String, default: "" },
      costo:     { type: Number, default: 0 },
      colonia:   { type: String, default: "" },
      municipio: { type: String, default: "" },
      direccion: { type: String, default: "" },
      hora:      { type: String, default: "" },
    },

    total:          { type: Number, default: 0 },  // productos + envío
    precio:         { type: Number, default: 0 },  // alias usado por el flujo de pago
    anticipo:       { type: Number, default: 0 },
    saldoPendiente: { type: Number, default: 0 },
    anticipoMetodo:     { type: String, default: "" },
    anticipoReferencia: { type: String, default: "" },

    cliente: {
      nombre:   { type: String, required: true, trim: true },
      telefono: { type: String, required: true, trim: true },
      email:    { type: String, default: "", trim: true, lowercase: true },
    },
    fecha:  { type: Date },
    notas:  { type: String, default: "" },

    status: { type: String, default: "Pendiente" },
    calendarEventId: { type: String, default: "" },
    reminderSentAt:  { type: Date },
    confirmacionEnviadaAt: { type: Date }, // guard: evita reenviar el correo de confirmación
    notasInternas: { type: [notaInternaSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PastelVintagePedido", pedidoVintageSchema);
