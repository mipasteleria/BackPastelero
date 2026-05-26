const DecoracionCotiza = require("../../models/cotizacionCatalogos/decoracion");
const crudFactory = require("./_crudFactory");

module.exports = crudFactory({
  Model: DecoracionCotiza,
  camposEditables: [
    "slug",
    "nombre",
    "descripcion",
    "emoji",
    "tecnicaCreativaId",
    "costoManual",
    "activo",
    "orden",
  ],
  populate: ["tecnicaCreativaId"],
});
