const express = require("express");
const router = express.Router();

/**
 * Mount-point único para los 4 catálogos de cotización personalizada.
 *
 * Se monta en index.js como:
 *   app.use("/cotizacion-catalogos", cotizacionCatalogosRoutes);
 *
 * Resulta en:
 *   /cotizacion-catalogos/sabores
 *   /cotizacion-catalogos/rellenos
 *   /cotizacion-catalogos/coberturas
 *   /cotizacion-catalogos/decoraciones
 *   /cotizacion-catalogos/postres
 */
router.use("/sabores",      require("./sabores"));
router.use("/rellenos",     require("./rellenos"));
router.use("/coberturas",   require("./coberturas"));
router.use("/decoraciones", require("./decoraciones"));
router.use("/postres",      require("./postres"));

module.exports = router;
