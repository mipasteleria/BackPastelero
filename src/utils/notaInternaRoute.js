const checkRoleToken = require("../middlewares/myRoleToken");

/**
 * Monta los endpoints de notas internas (POST + DELETE) sobre un router
 * Express, asociados al `Model` dado. Reutilizable entre galletaPedido
 * y las 3 cotizaciones (pastel/cupcake/snack).
 *
 * Endpoints montados (admin-only):
 *   POST   /:id/notas-internas             agrega una nota
 *   DELETE /:id/notas-internas/:notaId     borra una nota por su _id
 *
 * El autor de la nota se captura del JWT (`req.user`) — el cliente no
 * puede falsificarlo.
 *
 * @param {express.Router} router  Router donde montar
 * @param {mongoose.Model} Model   Modelo que tiene el array `notasInternas`
 * @param {string} entidadLabel    Etiqueta para mensajes (ej. "Pedido", "Cotización")
 */
function mountNotaInternaRoutes(router, Model, entidadLabel = "Documento") {
  // Agregar nota interna
  router.post("/:id/notas-internas", checkRoleToken("admin"), async (req, res) => {
    try {
      const { texto } = req.body || {};
      if (typeof texto !== "string" || !texto.trim()) {
        return res.status(400).json({ message: "El campo 'texto' es obligatorio" });
      }
      const doc = await Model.findById(req.params.id);
      if (!doc) return res.status(404).json({ message: `${entidadLabel} no encontrado` });

      doc.notasInternas = doc.notasInternas || [];
      doc.notasInternas.push({
        texto: texto.trim(),
        autorId:     req.user?._id ? String(req.user._id) : "",
        autorNombre: req.user?.name || "",
        autorEmail:  req.user?.email || "",
      });
      await doc.save();
      const nuevaNota = doc.notasInternas[doc.notasInternas.length - 1];
      res.status(201).json({
        message: "Nota interna agregada",
        data: nuevaNota,
        total: doc.notasInternas.length,
      });
    } catch (error) {
      console.error(`Error agregando nota interna a ${entidadLabel}:`, error);
      res.status(400).json({ message: error.message });
    }
  });

  // Borrar una nota interna por su _id
  router.delete("/:id/notas-internas/:notaId", checkRoleToken("admin"), async (req, res) => {
    try {
      const doc = await Model.findById(req.params.id);
      if (!doc) return res.status(404).json({ message: `${entidadLabel} no encontrado` });

      const antes = (doc.notasInternas || []).length;
      doc.notasInternas = (doc.notasInternas || []).filter(
        (n) => String(n._id) !== String(req.params.notaId)
      );
      if (doc.notasInternas.length === antes) {
        return res.status(404).json({ message: "Nota no encontrada" });
      }
      await doc.save();
      res.json({
        message: "Nota interna eliminada",
        total: doc.notasInternas.length,
      });
    } catch (error) {
      console.error(`Error eliminando nota interna en ${entidadLabel}:`, error);
      res.status(400).json({ message: error.message });
    }
  });
}

module.exports = { mountNotaInternaRoutes };
