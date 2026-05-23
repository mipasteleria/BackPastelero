const mongoose = require("mongoose");

/**
 * Configuración del home — singleton.
 *
 * Una sola doc en la colección. El admin la edita desde el dashboard y el
 * front la consume para personalizar:
 *   - Imagen central del hero (PNG sin fondo); fallback al emoji 🎂 si vacío.
 *   - Destino del chip "Favorito de la semana" (a qué producto navega al
 *     hacer click).
 *   - Destino del chip "Nuevo sabor".
 *
 * Defaults apuntan a galletas NY para que el comportamiento sea razonable
 * antes de que el admin configure nada.
 */
const homeConfigSchema = new mongoose.Schema(
  {
    imagenHeroUrl:      { type: String, default: "" },
    imagenHeroFileName: { type: String, default: "" }, // para poder borrar del GCS
    favoritoSemanaHref: { type: String, default: "/enduser/galletas-ny" },
    nuevoSaborHref:     { type: String, default: "/enduser/galletas-ny" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("HomeConfig", homeConfigSchema);
