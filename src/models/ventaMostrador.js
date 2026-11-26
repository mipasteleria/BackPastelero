const mongoose = require("mongoose");

/**
 * Venta de mostrador (punto de venta).
 *
 * Existe como modelo aparte en vez de reusar GalletaPedido/PostrePedido
 * porque esos exigen nombre, correo, teléfono y dirección de entrega: al
 * que compra una galleta en el local no se le piden, y rellenarlos con
 * datos falsos ensuciaría la base de clientes y los reportes.
 *
 * Aquí el cliente es opcional — si deja su nombre o quiere factura se
 * anota, si no, no.
 *
 * El pago ocurre FUERA del sistema: efectivo en caja o la terminal de
 * Mercado Pago. Esto solo registra qué se cobró y cómo, para que la venta
 * entre a los reportes.
 */

const itemSchema = new mongoose.Schema(
  {
    // "galleta-ny" | "postre" | "libre"
    tipo: { type: String, required: true, enum: ["galleta-ny", "postre", "libre"] },
    // Referencia al catálogo. Null en los conceptos libres.
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    slug: { type: String, default: "" },
    // Snapshot: si mañana cambia el nombre o el precio del producto, el
    // ticket de ayer debe seguir diciendo lo que se cobró ese día.
    nombre: { type: String, required: true, trim: true },
    precioUnitario: { type: Number, required: true, min: 0 },
    cantidad: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
    // Costo congelado al momento de vender. Permite que la venta de
    // mostrador aporte a la ganancia neta del dashboard, no solo al
    // ingreso. Null cuando no se pudo determinar (conceptos libres).
    costoUnitario: { type: Number, default: null },
  },
  { _id: false }
);

const ventaMostradorSchema = new mongoose.Schema(
  {
    numeroOrden: { type: String, required: true, unique: true, index: true },
    consecutivo: { type: Number, required: true },

    items: { type: [itemSchema], required: true, validate: [(v) => v.length > 0, "La venta necesita al menos un producto"] },
    subtotal: { type: Number, required: true, min: 0 },
    descuento: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },

    // Cómo se cobró. La terminal de Mercado Pago cobra comisión; el
    // efectivo no. El dashboard usa esto para descontarla solo donde
    // aplica.
    metodoPago: { type: String, required: true, enum: ["efectivo", "terminal"] },
    // Solo en efectivo: con cuánto pagó y cuánto se le regresó. Se guarda
    // para poder cuadrar la caja al cierre del día.
    efectivoRecibido: { type: Number, default: null, min: 0 },
    cambio: { type: Number, default: null, min: 0 },
    // Folio de la terminal, para conciliar contra el corte de Mercado Pago.
    referencia: { type: String, default: "", trim: true },

    // Quién cobró. Importante al tener varias personas en mostrador.
    vendidoPor: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    vendidoPorNombre: { type: String, default: "" },

    clienteNombre: { type: String, default: "", trim: true },
    notas: { type: String, default: "", trim: true },

    // Una venta no se borra: se cancela, y queda el rastro de quién y por
    // qué. Cancelada deja de contar en los reportes.
    cancelada: { type: Boolean, default: false },
    canceladaMotivo: { type: String, default: "" },
    canceladaAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// La consulta típica del dashboard y del corte de caja: ventas vivas de
// un rango de fechas.
ventaMostradorSchema.index({ createdAt: -1, cancelada: 1 });

module.exports = mongoose.model("VentaMostrador", ventaMostradorSchema);
