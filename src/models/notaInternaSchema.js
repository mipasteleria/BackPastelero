const mongoose = require("mongoose");

/**
 * Subdocumento embebido para notas internas de admin.
 *
 * Se usa como elemento de un array `notasInternas` en los modelos
 * que las soportan (galletaPedido + cotizaciones de pastel/cupcake/snack).
 *
 * Características:
 *   - Append-only desde la UI: el admin agrega notas, no las edita
 *     (los typos se corrigen con una nota nueva).
 *   - Sí se puede borrar via DELETE explícito.
 *   - `fecha` la setea Mongoose automáticamente al insertar
 *     (usamos timestamps con createdAt renombrado).
 *   - El autor se captura del `req.user` que mete el middleware de
 *     auth — `_id` para la traza, `name`/`email` para mostrar.
 *
 * NUNCA exponer al cliente final (solo el admin) — estas notas pueden
 * contener info sensible (método de pago, contacto alterno, etc).
 */
const notaInternaSchema = new mongoose.Schema(
  {
    texto: {
      type: String,
      required: [true, "El texto de la nota es obligatorio"],
      trim: true,
      maxlength: [1000, "La nota es demasiado larga (máx 1000 caracteres)"],
    },
    autorId:     { type: String, default: "" },
    autorNombre: { type: String, default: "" },
    autorEmail:  { type: String, default: "" },
  },
  {
    // createdAt se renombra a "fecha" — más natural en el contexto de notas.
    // No queremos updatedAt porque las notas son inmutables.
    timestamps: { createdAt: "fecha", updatedAt: false },
  }
);

module.exports = notaInternaSchema;
