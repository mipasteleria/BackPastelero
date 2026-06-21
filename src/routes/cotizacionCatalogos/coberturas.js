const CoberturaCotiza = require("../../models/cotizacionCatalogos/cobertura");
const Receta = require("../../models/recetas/recetas");
const checkRoleToken = require("../../middlewares/myRoleToken");
const crudFactory = require("./_crudFactory");

/**
 * Coberturas — CRUD + recosteo desde receta (igual patrón que sabores).
 *
 * El admin puede vincular una Receta y recostear: se lee
 * `total_cost / portions` y se congela en `costoUnitarioSnapshot`.
 * Si no hay receta, `costoPorPorcion` (manual) se usa como fallback.
 */
const router = crudFactory({
  Model: CoberturaCotiza,
  camposEditables: [
    "slug",
    "nombre",
    "descripcion",
    "recetaId",
    "costoPorPorcion",
    "paraVintage",
    "esFondant",
    "activo",
    "orden",
  ],
  populate: ["recetaId"],
  recostearReceta: true,
});

router.post("/:id/recostear", checkRoleToken("admin"), async (req, res) => {
  try {
    const cobertura = await CoberturaCotiza.findById(req.params.id);
    if (!cobertura) return res.status(404).json({ message: "Cobertura no encontrada" });
    if (!cobertura.recetaId) {
      return res.status(400).json({ message: "Esta cobertura no tiene receta vinculada" });
    }
    const receta = await Receta.findById(cobertura.recetaId);
    if (!receta) return res.status(404).json({ message: "Receta vinculada no existe" });
    if (!receta.portions || receta.portions <= 0) {
      return res.status(400).json({ message: "La receta no tiene `portions` válido" });
    }

    cobertura.costoUnitarioSnapshot = Math.round((receta.total_cost / receta.portions) * 100) / 100;
    cobertura.fechaCosteoSnapshot = new Date();
    await cobertura.save();

    res.json({ message: "Cobertura recosteada", data: cobertura });
  } catch (e) {
    console.error("Error recosteando cobertura:", e);
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;
