const CoberturaCotiza = require("../../models/cotizacionCatalogos/cobertura");
const crudFactory = require("./_crudFactory");

module.exports = crudFactory({
  Model: CoberturaCotiza,
  camposEditables: [
    "slug",
    "nombre",
    "descripcion",
    "costoPorPorcion",
    "esFondant",
    "activo",
    "orden",
  ],
});
