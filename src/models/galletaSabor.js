const mongoose = require("mongoose");

/**
 * Sabor de Galleta NY.
 *
 * Cada sabor es una pieza individual con stock por unidades. Las galletas
 * se conservan congeladas y se hornean el día de la entrega — por eso
 * el admin puede dar de alta lotes grandes (ej. 50 piezas) y el sistema
 * descuenta una por una conforme se compran.
 *
 * Cuando `stock <= 0` el sabor se considera AGOTADO y debe deshabilitarse
 * en el frontend del cliente. Cuando `stock < 6` se considera "pocas
 * piezas" y se debe mostrar la leyenda "¡Quedan pocas!".
 *
 * El campo `slug` es un identificador estable corto (ej. "chispas") usado
 * en pedidos en lugar del ObjectId — facilita lecturas en el ticket.
 */
const galletaSaborSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, "Slug solo permite minúsculas, números y guiones"],
    },
    nombre:      { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true, default: "Chocolate belga" },

    precio: {
      type: Number,
      required: true,
      min: [0, "Precio no puede ser negativo"],
    },
    stock: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Stock no puede ser negativo"],
    },

    // Visual / branding
    imagen:   { type: String, default: "" },          // URL en GCS
    emoji:    { type: String, default: "🍪" },
    bg:       { type: String, default: "linear-gradient(135deg,#FFE2E7,#FFC3C9)" },

    // Tag opcional ("Bestseller", "Nuevo", "Favorito", etc.)
    tag:      { type: String, default: "" },
    tagColor: { type: String, default: "" },
    tagText:  { type: String, default: "" },

    // Banderas
    esTemporada: { type: Boolean, default: false },  // Edición limitada / sabor de temporada
    activo:      { type: Boolean, default: true },   // Soft-delete: false oculta del catálogo

    orden: { type: Number, default: 0 },              // Para ordenar en el frontend
  },
  { timestamps: true }
);

// Helpers virtuales — útiles en respuestas JSON.
galletaSaborSchema.virtual("estadoStock").get(function () {
  if (this.stock <= 0) return "agotado";
  if (this.stock < 6)  return "pocas";
  return "disponible";
});

// Asegurar que los virtuales se serialicen.
galletaSaborSchema.set("toJSON",   { virtuals: true });
galletaSaborSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("galletaSabor", galletaSaborSchema);
