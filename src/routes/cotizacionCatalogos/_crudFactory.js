const express = require("express");
const checkRoleToken = require("../../middlewares/myRoleToken");

/**
 * Factory de un router CRUD estándar para los 4 catálogos de cotización
 * (sabor, relleno, cobertura, decoración).
 *
 * Comportamiento común:
 * - GET /        → listado público. Solo `activo:true` por default.
 *                  ?incluyeInactivos=true para que el admin vea todos.
 * - GET /:id     → detalle (público también — el front lo usa en la
 *                  vista de detalle de cotización para resolver slugs).
 * - POST /       → admin. Recibe whitelist de campos.
 * - PUT /:id     → admin. Misma whitelist.
 * - DELETE /:id  → admin. Hard delete (los catálogos no se referencian
 *                  por ObjectId en cotizaciones — se snapshotean, ver
 *                  modelo CotizacionPersonalizada).
 *
 * El llamador especifica:
 *  - Model: modelo mongoose
 *  - camposEditables: array de strings whitelist
 *  - populate (opcional): array de paths a popular en GET
 */
function crudFactory({ Model, camposEditables, populate = [] }) {
  const router = express.Router();

  const pickEditables = (body) => {
    const out = {};
    for (const k of camposEditables) {
      if (Object.prototype.hasOwnProperty.call(body || {}, k)) out[k] = body[k];
    }
    return out;
  };

  const applyPopulate = (q) => {
    for (const p of populate) q = q.populate(p);
    return q;
  };

  router.get("/", async (req, res) => {
    try {
      const filter = {};
      if (req.query.incluyeInactivos !== "true") filter.activo = true;
      const docs = await applyPopulate(Model.find(filter)).sort({ orden: 1, createdAt: -1 });
      res.json({ data: docs });
    } catch (e) {
      console.error(`Error listando ${Model.modelName}:`, e);
      res.status(500).json({ message: e.message });
    }
  });

  router.get("/:idOrSlug", async (req, res) => {
    try {
      const { idOrSlug } = req.params;
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(idOrSlug);
      const doc = isObjectId
        ? await applyPopulate(Model.findById(idOrSlug))
        : await applyPopulate(Model.findOne({ slug: idOrSlug }));
      if (!doc) return res.status(404).json({ message: `${Model.modelName} no encontrado` });
      res.json({ data: doc });
    } catch (e) {
      console.error(`Error obteniendo ${Model.modelName}:`, e);
      res.status(500).json({ message: e.message });
    }
  });

  router.post("/", checkRoleToken("admin"), async (req, res) => {
    try {
      const data = pickEditables(req.body);
      const doc = await Model.create(data);
      res.status(201).json({ message: `${Model.modelName} creado`, data: doc });
    } catch (e) {
      if (e.code === 11000) {
        return res.status(409).json({ message: `Ya existe ${Model.modelName} con ese slug` });
      }
      console.error(`Error creando ${Model.modelName}:`, e);
      res.status(400).json({ message: e.message });
    }
  });

  router.put("/:id", checkRoleToken("admin"), async (req, res) => {
    try {
      const data = pickEditables(req.body);
      const doc = await Model.findByIdAndUpdate(req.params.id, data, {
        new: true,
        runValidators: true,
      });
      if (!doc) return res.status(404).json({ message: `${Model.modelName} no encontrado` });
      res.json({ message: `${Model.modelName} actualizado`, data: doc });
    } catch (e) {
      if (e.code === 11000) {
        return res.status(409).json({ message: `Ya existe ${Model.modelName} con ese slug` });
      }
      console.error(`Error actualizando ${Model.modelName}:`, e);
      res.status(400).json({ message: e.message });
    }
  });

  router.delete("/:id", checkRoleToken("admin"), async (req, res) => {
    try {
      const doc = await Model.findByIdAndDelete(req.params.id);
      if (!doc) return res.status(404).json({ message: `${Model.modelName} no encontrado` });
      res.json({ message: `${Model.modelName} eliminado` });
    } catch (e) {
      console.error(`Error eliminando ${Model.modelName}:`, e);
      res.status(400).json({ message: e.message });
    }
  });

  return router;
}

module.exports = crudFactory;
