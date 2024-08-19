const express = require("express");
const router = express.Router();
const Ingrediente = require("../../models/recetas/ingrediente"); // Verifica que la ruta al modelo sea correcta
const checkRoleToken = require("../../middlewares/myRoleToken");

router.post("/", checkRoleToken("admin"), async (req, res) => {
  try {
    const ingrediente = req.body;

    // Verificar y depurar datos recibidos
    console.log("Datos recibidos:", ingrediente);

    // Verifica que todos los campos requeridos estén presentes
    if (
      !ingrediente.ingrediente ||
      !ingrediente.cantidad ||
      !ingrediente.precio ||
      !ingrediente.unidad ||
      !ingrediente.total
    ) {
      return res
        .status(400)
        .send({ message: "Todos los campos son requeridos" });
    }

    // Crear el nuevo ingrediente en la base de datos
    const newIngrediente = await Ingrediente.create(ingrediente);
    res
      .status(201)
      .send({ message: "Ingrediente creado", data: newIngrediente });
  } catch (error) {
    console.error("Error al crear el ingrediente:", error); // Registrar el error
    res.status(400).send({ message: error.message });
  }
});

// Obtener todos los ingredientes (GET)
router.get("/", checkRoleToken("admin"), async (req, res) => {
  try {
    const ingredientes = await Ingrediente.find();
    res.status(200).send({ data: ingredientes });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// Obtener un ingrediente por ID (GET)
router.get("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const ingrediente = await Ingrediente.findById(id);
    if (!ingrediente) {
      return res.status(404).send({ message: "Ingrediente no encontrado" });
    }
    res.status(200).send({ data: ingrediente });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// Actualizar un ingrediente por ID (PUT)
router.put("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const ingrediente = req.body;
    const updatedIngrediente = await Ingrediente.findByIdAndUpdate(
      id,
      ingrediente,
      { new: true }
    );
    if (!updatedIngrediente) {
      return res.status(404).send({ message: "Ingrediente no encontrado" });
    }
    res
      .status(200)
      .send({ message: "Ingrediente actualizado", data: updatedIngrediente });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// Eliminar un ingrediente por ID (DELETE)
router.delete("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const deletedIngrediente = await Ingrediente.findByIdAndDelete(id);
    if (!deletedIngrediente) {
      return res.status(404).send({ message: "Ingrediente no encontrado" });
    }
    res
      .status(200)
      .send({ message: "Ingrediente eliminado", data: deletedIngrediente });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

module.exports = router;
