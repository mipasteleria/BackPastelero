const mongoose = require("mongoose");
const notaInternaSchema = require("./notaInternaSchema");

/**
 * CotizacionPersonalizada — modelo unificado del rediseño 2026 de
 * `/cotizacion`.
 *
 * Reemplaza a futuro al viejo `pastelCotiza` pero NO lo borra (los
 * registros históricos siguen funcionando). Las nuevas cotizaciones que
 * vienen de la maqueta game-like se guardan aquí.
 *
 * Estructura: las 9 secciones de la maqueta + cliente + admin metadata.
 *
 * Cada selección de catálogo se guarda como SNAPSHOT (id + slug + nombre
 * + costoPorPorcionSnapshot cuando aplica). Si el admin después renombra
 * o ajusta el catálogo, ESTA cotización no cambia.
 *
 * El costeo real (link a receta + técnicas) se hace en `costeoSnapshot`
 * vía el endpoint POST /cotizacion-personalizada/:id/calcular-costeo
 * (Fase D). Para clientes esto NO se devuelve.
 */

// ── Sub-snapshots ────────────────────────────────────────────────────

const seleccionCatalogoSnap = new mongoose.Schema(
  {
    catalogoId: { type: mongoose.Schema.Types.ObjectId },
    slug:       { type: String },
    nombre:     { type: String },
    // Costo congelado al momento de crear la cotización — opcional
    // (sabor lo resuelve por receta más tarde, por eso puede venir null).
    costoSnapshot: { type: Number, default: null },
    // Para cobertura, congelamos si era fondant.
    esFondant: { type: Boolean, default: false },
  },
  { _id: false }
);

// ── Schema principal ─────────────────────────────────────────────────

const cotizacionPersonalizadaSchema = new mongoose.Schema(
  {
    // ── Tipo de producto ─────────────────────────────────────────
    // "pastel" (default, comportamiento histórico), "cupcake" (mismos
    // catálogos que el pastel) o "mesa-postres" (catálogo de postres).
    tipoProducto: {
      type: String,
      enum: ["pastel", "cupcake", "mesa-postres"],
      default: "pastel",
    },

    // ── 1. Evento ────────────────────────────────────────────────
    evento: {
      tipo:      { type: String, required: true },  // "boda" | "xv" | "cumple" | ...
      fecha:     { type: Date,   required: true },
      invitados: { type: Number, required: true, min: 1 },
    },

    // ── 2. Niveles del pastel (solo pastel) ──────────────────────
    niveles: { type: Number, min: 1, max: 6, default: 1 },

    // ── Mesa de postres ──────────────────────────────────────────
    // El cliente elige nº de personas (= evento.invitados) y cuántos
    // postres por persona; `postres` es el multi-select del catálogo.
    postresPorPersona: { type: Number, default: 1, min: 1 },
    postres: { type: [seleccionCatalogoSnap], default: [] },

    // ── 3. Sabor del bizcocho ────────────────────────────────────
    sabor: { type: seleccionCatalogoSnap, default: null },

    // Cupcakes: sabor por docena (ej. 2 doc vainilla + 2 doc chocolate).
    saboresCupcake: {
      type: [
        new mongoose.Schema(
          {
            catalogoId: { type: mongoose.Schema.Types.ObjectId },
            slug: { type: String },
            nombre: { type: String },
            costoSnapshot: { type: Number, default: null },
            docenas: { type: Number, default: 1, min: 1 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    // ── 4. Sabor del relleno ─────────────────────────────────────
    relleno: { type: seleccionCatalogoSnap, default: null },

    // ── 5. Cobertura ─────────────────────────────────────────────
    cobertura:      { type: seleccionCatalogoSnap, default: null },
    // Gramos de cobertura para el costeo (editable por el admin). Si es null,
    // se usa la base: 500 g por docena de cupcakes / 500 g por 10 porciones.
    coberturaGramos: { type: Number, default: null },
    colorPrincipal: { type: String, default: "" }, // hex "#FFC9D4" o nombre

    // ── 6. Decoraciones (multi-select) ───────────────────────────
    decoraciones: { type: [seleccionCatalogoSnap], default: [] },

    // ── 7. Estilo + inspiración ──────────────────────────────────
    estilo: {
      value:       { type: String, default: "" }, // "minimalista" | "elegante" | ...
      comentarios: { type: String, default: "" },
      imagenesInspiracion: { type: [String], default: [] }, // URLs subidas
    },

    // ── 8. Entrega ───────────────────────────────────────────────
    entrega: {
      tipo:      { type: String, default: "" }, // "recoger" | "domicilio" | ...
      fecha:     { type: Date,   default: null }, // a veces igual al evento, a veces 1 día antes
      hora:      { type: String, default: "" }, // HH:mm
      direccion: { type: String, default: "" },
    },

    // ── 9. Cliente ───────────────────────────────────────────────
    cliente: {
      nombre:   { type: String, required: true, trim: true },
      telefono: {
        type: String,
        required: true,
        // Permitir tanto el formato XXX-XXX-XXXX como variantes con +52,
        // espacios, etc. Validamos largo mínimo y que tenga ≥10 dígitos.
        validate: {
          validator: (v) => (v || "").replace(/\D/g, "").length >= 10,
          message: "Teléfono debe tener al menos 10 dígitos",
        },
      },
      email:   { type: String, default: "", trim: true, lowercase: true },
    },

    // Número de orden legible (PAS-/CUP-/SNA-...). Se genera al crear.
    numeroOrden: { type: String, default: "" },

    // Referencia al registro legacy del que se migró (dedupe de migración).
    legacyRef: {
      tipo: { type: String, default: "" },   // "pastel" | "cupcake" | "snack"
      id:   { type: mongoose.Schema.Types.ObjectId, default: null },
    },

    // ── Enlace público (invitado) ────────────────────────────────
    // Token aleatorio para compartir la cotización por WhatsApp sin que
    // el cliente necesite cuenta. El front lo abre en /cotizacion/ver/:token.
    publicToken: { type: String, default: null, index: true },

    // Confirmación del cliente cuando elige pagar por transferencia/efectivo.
    confirmacionCliente: {
      confirmado: { type: Boolean, default: false },
      metodo:     { type: String, default: "" }, // "transferencia" | "efectivo"
      fecha:      { type: Date, default: null },
    },

    // ── Validez de la cotización ─────────────────────────────────
    // La cotización es válida 30 días desde el envío. Se muestra al
    // cliente y la usa el job de limpieza de imágenes (las cotizaciones
    // NO compradas borran sus imágenes 1 semana después de vencer).
    validUntil: { type: Date, default: null },

    // Marca de cuándo se limpiaron las imágenes de inspiración (para
    // que el job no reprocese la misma cotización).
    imagenesEliminadasAt: { type: Date, default: null },

    // ── Admin metadata ───────────────────────────────────────────
    status: { type: String, default: "Pendiente" },
    userId: { type: String, default: "" }, // si vino de un cliente loggeado

    // Precio cerrado por el admin (después de costeo + decisión humana)
    precio:         { type: Number },
    anticipo:       { type: Number },
    saldoPendiente: { type: Number, default: 0 },

    // Confirmación manual del anticipo por el admin (cuando lo registra a
    // mano al pasar a "Agendado · producción").
    anticipoMetodo:     { type: String, default: "" }, // "transferencia" | "efectivo" | "otro"
    anticipoReferencia: { type: String, default: "" }, // folio, nota, etc.

    // Snapshot del cálculo automático — se llena con
    // POST /cotizacion-personalizada/:id/calcular-costeo (Fase D)
    costeoSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },

    // Renglones extra que el admin agrega manualmente al costeo, encima
    // de la base automática (estructura, técnicas, insumos, recetas o un
    // costo libre). Se suman al costoTotal en /calcular-costeo.
    costeoExtras: {
      type: [
        new mongoose.Schema(
          {
            tipo: { type: String, enum: ["receta", "tecnica", "insumo", "manual"], default: "manual" },
            refId: { type: mongoose.Schema.Types.ObjectId, default: null },
            concepto: { type: String, default: "" },
            costoUnitario: { type: Number, default: 0 },
            cantidad: { type: Number, default: 1 },
            subtotal: { type: Number, default: 0 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    // Evento de Google Calendar (si la cotización se agenda)
    calendarEventId: { type: String, default: "" },
    reminderSentAt:  { type: Date },

    // Recordatorios de cotización activa (si no se ha agendado):
    // uno 7 días antes del evento y "última oportunidad" 3 días antes.
    recordatorioSemanaAt:   { type: Date, default: null },
    recordatorioTresDiasAt: { type: Date, default: null },

    // Notas internas append-only (mismo patrón que pastelCotiza)
    notasInternas: { type: [notaInternaSchema], default: [] },
  },
  { timestamps: true }
);

// Índices útiles para listar en admin: por status + fecha del evento.
cotizacionPersonalizadaSchema.index({ status: 1, "evento.fecha": 1 });
cotizacionPersonalizadaSchema.index({ "cliente.email": 1 });
cotizacionPersonalizadaSchema.index({ userId: 1 });

module.exports = mongoose.model(
  "CotizacionPersonalizada",
  cotizacionPersonalizadaSchema
);
