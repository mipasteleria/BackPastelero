const express = require("express");
const SaborCotiza = require("../../models/cotizacionCatalogos/sabor");
const Receta = require("../../models/recetas/recetas");
const checkRoleToken = require("../../middlewares/myRoleToken");
const crudFactory = require("./_crudFactory");

/**
 * Sabores del bizcocho — CRUD + recosteo desde receta.
 *
 * El recosteo es admin-only y opera análogo a galletaSabores: lee la
 * receta vinculada, calcula `total_cost / portions` y lo guarda en
 * `costoUnitarioSnapshot`. El cliente NUNCA ve ese costo — solo el
 * desglose interno de la cotización lo usa.
 */
const router = crudFactory({
  Model: SaborCotiza,
  camposEditables: [
    "slug",
    "nombre",
    "descripcion",
    "swatch",
    "emoji",
    "recetaId",
    "costoManualPorPorcion",
    "paraPastel",
    "paraCupcake",
    "paraVintage",
    "activo",
    "orden",
  ],
  populate: ["recetaId"],
  recostearReceta: true,
});

/**
 * POST /sabores/:id/recostear — admin.
 *
 * Resuelve la receta vinculada y guarda el snapshot de costo unitario.
 * Devuelve el sabor actualizado con el nuevo snapshot.
 */
router.post("/:id/recostear", checkRoleToken("admin"), async (req, res) => {
  try {
    const sabor = await SaborCotiza.findById(req.params.id);
    if (!sabor) return res.status(404).json({ message: "Sabor no encontrado" });
    if (!sabor.recetaId) {
      return res.status(400).json({ message: "Este sabor no tiene receta vinculada" });
    }
    const receta = await Receta.findById(sabor.recetaId);
    if (!receta) return res.status(404).json({ message: "Receta vinculada no existe" });
    if (!receta.portions || receta.portions <= 0) {
      return res.status(400).json({ message: "La receta no tiene `portions` válido" });
    }

    sabor.costoUnitarioSnapshot = Math.round((receta.total_cost / receta.portions) * 100) / 100;
    sabor.fechaCosteoSnapshot = new Date();
    await sabor.save();

    res.json({ message: "Sabor recosteado", data: sabor });
  } catch (e) {
    console.error("Error recosteando sabor:", e);
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;
