const PostreCotiza = require("../../models/cotizacionCatalogos/postre");
const Receta = require("../../models/recetas/recetas");
const checkRoleToken = require("../../middlewares/myRoleToken");
const express = require("express");
const crudFactory = require("./_crudFactory");
const Cost = require("../../models/costs");
const { costearPostreMesa } = require("../../utils/costeoPostreMesa");

/**
 * Postres (mesa de postres) — CRUD + recosteo desde receta.
 *
 * Mismo patrón que sabores: el admin vincula una Receta y recostea para
 * congelar `costoUnitarioSnapshot` (total_cost / portions). Si no hay
 * receta, `costoManual` (por porción) se usa como fallback.
 */
// OJO con el orden: el CRUD genérico define `GET /:id`, que capturaría
// `/costeo` tratándolo como un id. Por eso las rutas específicas se
// registran primero y el CRUD se monta al final.
const router = express.Router();

const crudRouter = crudFactory({
  Model: PostreCotiza,
  camposEditables: [
    "slug",
    "nombre",
    "descripcion",
    "emoji",
    "imagenUrl",
    "imagenFileName",
    "recetaId",
    "costoManual",
    "precioManual",
    "activo",
    "orden",
  ],
  populate: ["recetaId"],
  recostearReceta: true,
});

/**
 * GET /cotizacion-catalogos/postres/costeo — admin.
 *
 * Devuelve cada postre del catálogo con su costo, margen y PRECIO por
 * porción, calculados con el mismo helper que usa el costeo real de la
 * cotización. Existe porque la pantalla de catálogo solo mostraba el
 * costo, y daba la impresión de que el margen no se estaba aplicando
 * cuando sí se aplicaba al cotizar.
 */
router.get("/costeo", checkRoleToken("admin"), async (req, res) => {
  try {
    const cfg = await Cost.findOne();
    const markup = cfg?.markupCotizacionesPct ?? cfg?.markupPostresPct ?? 60;
    const postres = await PostreCotiza.find().populate("recetaId").sort({ orden: 1 });
    res.json({
      markupGlobal: markup,
      data: postres.map((p) => ({
        _id: p._id,
        slug: p.slug,
        nombre: p.nombre,
        ...costearPostreMesa(p, markup),
      })),
    });
  } catch (e) {
    console.error("Error costeando catálogo de postres:", e);
    res.status(500).json({ message: e.message });
  }
});

router.post("/:id/recostear", checkRoleToken("admin"), async (req, res) => {
  try {
    const postre = await PostreCotiza.findById(req.params.id);
    if (!postre) return res.status(404).json({ message: "Postre no encontrado" });
    if (!postre.recetaId) {
      return res.status(400).json({ message: "Este postre no tiene receta vinculada" });
    }
    const receta = await Receta.findById(postre.recetaId);
    if (!receta) return res.status(404).json({ message: "Receta vinculada no existe" });
    if (!receta.portions || receta.portions <= 0) {
      return res.status(400).json({ message: "La receta no tiene `portions` válido" });
    }

    postre.costoUnitarioSnapshot = Math.round((receta.total_cost / receta.portions) * 100) / 100;
    postre.fechaCosteoSnapshot = new Date();
    await postre.save();

    res.json({ message: "Postre recosteado", data: postre });
  } catch (e) {
    console.error("Error recosteando postre:", e);
    res.status(400).json({ message: e.message });
  }
});

// El CRUD genérico va al final, ya con /costeo y /:id/recostear registrados.
router.use(crudRouter);

module.exports = router;
