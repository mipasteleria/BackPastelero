const RellenoCotiza = require("../../models/cotizacionCatalogos/relleno");
const crudFactory = require("./_crudFactory");

module.exports = crudFactory({
  Model: RellenoCotiza,
  camposEditables: [
    "slug",
    "nombre",
    "descripcion",
    "costoPorPorcion",
    "activo",
    "orden",
  ],
});
