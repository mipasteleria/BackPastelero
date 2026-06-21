const RellenoCotiza = require("../../models/cotizacionCatalogos/relleno");
const Receta = require("../../models/recetas/recetas");
const checkRoleToken = require("../../middlewares/myRoleToken");
const crudFactory = require("./_crudFactory");

/**
 * Rellenos — CRUD + recosteo desde receta (igual patrón que sabores).
 *
 * El admin puede vincular una Receta y recostear: se lee
 * `total_cost / portions` y se congela en `costoUnitarioSnapshot`.
 * Si no hay receta, `costoPorPorcion` (manual) se usa como fallback.
 */
const router = crudFactory({
  Model: RellenoCotiza,
  camposEditables: [
    "slug",
    "nombre",
    "descripcion",
    "recetaId",
    "costoPorPorcion",
    "paraVintage",
    "activo",
    "orden",
  ],
  populate: ["recetaId"],
  recostearReceta: true,
});

router.post("/:id/recostear", checkRoleToken("admin"), async (req, res) => {
  try {
    const relleno = await RellenoCotiza.findById(req.params.id);
    if (!relleno) return res.status(404).json({ message: "Relleno no encontrado" });
    if (!relleno.recetaId) {
      return res.status(400).json({ message: "Este relleno no tiene receta vinculada" });
    }
    const receta = await Receta.findById(relleno.recetaId);
    if (!receta) return res.status(404).json({ message: "Receta vinculada no existe" });
    if (!receta.portions || receta.portions <= 0) {
      return res.status(400).json({ message: "La receta no tiene `portions` válido" });
    }

    relleno.costoUnitarioSnapshot = Math.round((receta.total_cost / receta.portions) * 100) / 100;
    relleno.fechaCosteoSnapshot = new Date();
    await relleno.save();

    res.json({ message: "Relleno recosteado", data: relleno });
  } catch (e) {
    console.error("Error recosteando relleno:", e);
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;
