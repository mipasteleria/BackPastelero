const express = require("express");
const router = express.Router();
const Receta = require("../../models/recetas/recetas"); // Verifica que el modelo exista y esté en la ruta correcta
const checkRoleToken = require("../../middlewares/myRoleToken");

// Crear una nueva receta (POST)
router.post("/", async (req, res) => {
  try {
    const receta = req.body;

    // Verifica los datos recibidos
    console.log("Datos recibidos:", receta);

    // Validaciones
    if (
      !receta.nombre_receta ||
      !receta.descripcion ||
      !Array.isArray(receta.ingredientes) ||
      receta.ingredientes.length === 0
    ) {
      return res.status(400).send({ message: "Datos incompletos o inválidos" });
    }

    // Crear la nueva receta en la base de datos
    const newReceta = await Receta.create(receta);
    res.status(201).send({ message: "Receta creada", data: newReceta });
  } catch (error) {
    console.error("Error al guardar la receta:", error); // Añadir más detalles si es posible
    res.status(400).send({ message: error.message });
  }
});

// Obtener todas las recetas (GET)
router.get("/", async (req, res) => {
  try {
    const recetas = await Receta.find();
    res.status(200).send({ data: recetas });
  } catch (error) {
    console.error("Error al obtener las recetas:", error);
    res.status(400).send({ message: error.message });
  }
});

// Obtener una receta por ID (GET)
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const receta = await Receta.findById(id);
    if (!receta) {
      return res.status(404).send({ message: "Receta no encontrada" });
    }
    res.status(200).send({ data: receta });
  } catch (error) {
    console.error("Error al obtener la receta:", error);
    res.status(400).send({ message: error.message });
  }
});

// Actualizar una receta por ID (PUT)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const receta = req.body;
    const updatedReceta = await Receta.findByIdAndUpdate(id, receta, {
      new: true,
    });
    if (!updatedReceta) {
      return res.status(404).send({ message: "Receta no encontrada" });
    }
    res
      .status(200)
      .send({ message: "Receta actualizada", data: updatedReceta });
  } catch (error) {
    console.error("Error al actualizar la receta:", error);
    res.status(400).send({ message: error.message });
  }
});

// Eliminar una receta por ID (DELETE)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deletedReceta = await Receta.findByIdAndDelete(id);
    if (!deletedReceta) {
      return res.status(404).send({ message: "Receta no encontrada" });
    }
    res.status(200).send({ message: "Receta eliminada", data: deletedReceta });
  } catch (error) {
    console.error("Error al eliminar la receta:", error);
    res.status(400).send({ message: error.message });
  }
});

module.exports = router;
