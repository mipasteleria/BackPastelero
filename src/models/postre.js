const mongoose = require("mongoose");

/**
 * Postre del catálogo "Top postres".
 *
 * A diferencia de las cotizaciones personalizadas, estos son productos
 * con precio fijo que el cliente puede comprar directamente desde el
 * catálogo (similar al flujo de Galletas NY pero por unidad, sin variantes
 * y sin stock — se preparan bajo pedido).
 *
 * El campo `slug` es un identificador estable usado en URLs públicas
 * (ej. /enduser/postres/pay-de-pistache) y en los pedidos.
 *
 * El admin marca hasta 4 postres como `destacado: true`, que son los que
 * aparecen en la sección "Los más horneados" del home. La validación de
 * "no más de 4 destacados" vive en el controller, no en el schema, para
 * que pueda devolver un 400 con mensaje claro.
 */
const postreSchema = new mongoose.Schema(
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

    precio: {
      type: Number,
      required: true,
      min: [0, "Precio no puede ser negativo"],
    },

    // Imagen del producto. fileName se guarda para poder borrar el blob
    // de GCS cuando se reemplaza o se elimina el postre (evita huérfanos).
    imagenUrl:      { type: String, default: "" },
    imagenFileName: { type: String, default: "" },

    // Soft-delete: activo=false oculta del catálogo público pero conserva
    // historial para reportes y pedidos antiguos que referencien el postre.
    activo:    { type: Boolean, default: true },
    destacado: { type: Boolean, default: false },

    orden: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Index para la query del home (los 4 destacados activos).
postreSchema.index({ activo: 1, destacado: 1, orden: 1 });

module.exports = mongoose.model("Postre", postreSchema);
