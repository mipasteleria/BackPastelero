const PostreCotiza = require("../../models/cotizacionCatalogos/postre");
const Receta = require("../../models/recetas/recetas");
const checkRoleToken = require("../../middlewares/myRoleToken");
const crudFactory = require("./_crudFactory");

/**
 * Postres (mesa de postres) — CRUD + recosteo desde receta.
 *
 * Mismo patrón que sabores: el admin vincula una Receta y recostea para
 * congelar `costoUnitarioSnapshot` (total_cost / portions). Si no hay
 * receta, `costoManual` (por porción) se usa como fallback.
 */
const router = crudFactory({
  Model: PostreCotiza,
  camposEditables: [
    "slug",
    "nombre",
    "descripcion",
    "emoji",
    "recetaId",
    "costoManual",
    "activo",
    "orden",
  ],
  populate: ["recetaId"],
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

module.exports = router;
