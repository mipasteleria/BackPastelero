const express = require("express");
const router = express.Router();
const crudFactory = require("../cotizacionCatalogos/_crudFactory");

const Porcion = require("../../models/vintage/porcion");
const Piso = require("../../models/vintage/piso");
const Forma = require("../../models/vintage/forma");
const Color = require("../../models/vintage/color");
const Decoracion = require("../../models/vintage/decoracion");

/**
 * Catálogos del pastel vintage, gestionables desde el dashboard.
 *   /vintage-catalogos/porciones
 *   /vintage-catalogos/pisos
 *   /vintage-catalogos/formas
 *   /vintage-catalogos/colores
 *   /vintage-catalogos/decoraciones
 */
router.use("/porciones", crudFactory({
  Model: Porcion,
  camposEditables: [
    "slug", "nombre", "porciones", "pisosMax", "anticipacionDias",
    "costoBase", "margenBase", "costoDomo", "margenDomo", "costoBranding", "margenBranding",
    "activo", "orden",
  ],
}));

router.use("/pisos", crudFactory({
  Model: Piso,
  camposEditables: ["slug", "nombre", "niveles", "costo", "margen", "activo", "orden"],
}));

router.use("/formas", crudFactory({
  Model: Forma,
  camposEditables: ["slug", "nombre", "emoji", "imagenUrl", "activo", "orden"],
}));

router.use("/colores", crudFactory({
  Model: Color,
  camposEditables: ["slug", "nombre", "hex", "imagenUrl", "costo", "margen", "activo", "orden"],
}));

router.use("/decoraciones", crudFactory({
  Model: Decoracion,
  camposEditables: ["slug", "nombre", "descripcion", "costo", "margen", "colores", "activo", "orden"],
}));

module.exports = router;
