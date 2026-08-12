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

    // Precio por UNIDAD de venta (ver `unidad`): por pieza, por docena o
    // por kilo según cómo se venda el producto.
    precio: {
      type: Number,
      required: true,
      min: [0, "Precio no puede ser negativo"],
    },

    // ── Categoría y forma de venta ────────────────────────────────
    // `categoria` separa el catálogo de postres del de galletas
    // artesanales (alfajores, besos de nuez, pastisetas…). Ambas se
    // preparan bajo pedido y comparten motor de compra.
    categoria: {
      type: String,
      enum: ["postre", "galleta"],
      default: "postre",
    },
    // Unidad de venta. `minimo` y `paso` permiten reglas como "mínimo 6
    // piezas", "mínimo 12" o "desde 1/2 kilo en múltiplos de 1/2".
    unidad: {
      type: String,
      enum: ["pieza", "docena", "kg"],
      default: "pieza",
    },
    minimo: { type: Number, default: 1, min: [0, "El mínimo no puede ser negativo"] },
    paso:   { type: Number, default: 1, min: [0, "El incremento no puede ser negativo"] },

    // ── Costeo opcional desde receta ──────────────────────────────
    // Si `recetaId` está presente, el sistema puede sugerir un precio
    // basado en (receta.total_cost / receta.portions) × cantidadReceta
    // + branding global + empaque + markup. Es informativo — el admin
    // puede usar el sugerido o setear `precio` manualmente.
    recetaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Receta",
      default: null,
    },
    // Cuántas unidades de la receta consume un postre. Default 1 (un
    // postre = 1 porción/pieza). Permite postres como "Rosca de naranja"
    // que usa 20 porciones de una receta que rinde 40 porciones, o un
    // "Bote de mermelada" que usa 100g de una receta que rinde 500g.
    // La unidad la dicta `receta.unidadRendimiento`.
    cantidadReceta: {
      type: Number,
      default: 1,
      min: [0, "La cantidad no puede ser negativa"],
    },
    // Empaque varía por postre (domo, caja, base de cartón, etc.).
    // Se suma al costo unitario antes de aplicar el markup.
    costoEmpaque: {
      type: Number,
      default: 0,
      min: [0, "El costo de empaque no puede ser negativo"],
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
