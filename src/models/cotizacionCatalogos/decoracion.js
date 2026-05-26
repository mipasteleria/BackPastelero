const mongoose = require("mongoose");

/**
 * Decoración para la cotización personalizada de pastel.
 *
 * Catálogo multi-select (el cliente puede elegir varias). Cada decoración
 * puede vincularse opcionalmente a una `TecnicaCreativa` ya existente,
 * de la cual el back resuelve el costo:
 *
 *   costo = tecnica.costoBase + tecnica.escalaPorPorcion × porciones
 *           + tecnica.tiempoHoras × tarifaHora
 *
 * Si no hay técnica, se usa `costoManual` plano.
 *
 * En la maqueta esto pinta como un `.deco` con emoji + nombre + precio
 * pequeño. Multi-select.
 */
const decoracionSchema = new mongoose.Schema(
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
    descripcion: { type: String, trim: true, default: "" },
    emoji:       { type: String, default: "🎀" },

    // ── Costeo ──────────────────────────────────────────────
    // Preferido: vincular a una Técnica Creativa existente.
    tecnicaCreativaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TecnicaCreativa",
      default: null,
    },

    // Fallback: si no hay técnica, costo plano (no escala con porciones).
    costoManual: { type: Number, default: 0, min: 0 },

    activo: { type: Boolean, default: true },
    orden:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DecoracionCotiza", decoracionSchema);
