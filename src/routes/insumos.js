const express = require("express");
const router = express.Router();
const Insumos = require("../models/insumos");
const checkRoleToken = require("../middlewares/myRoleToken");

// Enviar Insumo (POST)
router.post("/", checkRoleToken("admin"), async (req, res) => {
  try {
    const insumo = req.body;
    const newInsumo = await Insumos.create(insumo);
    res.status(201).send({ message: "Insumo created", data: newInsumo });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// Obtener todos los Insumos (GET)
router.get("/", checkRoleToken("admin"), async (req, res) => {
  try {
    const insumos = await Insumos.find(); // Obtener todos los documentos
    res.status(200).send(insumos);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

router.get("/nombres", checkRoleToken("admin"), async (req, res) => {
  try {
    // Obtener solo los nombres de los documentos
    const nombres = await Insumos.find({}, "name"); // Obtener solo el campo 'name'
    res.status(200).send(nombres.map((insumo) => insumo.name));
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// Obtener un Insumo por ID (GET)
router.get("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const insumo = await Insumos.findById(id);
    if (!insumo) {
      return res.status(404).send({ message: "Insumo not found" });
    }
    res.status(200).send(insumo);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// Actualizar un Insumo (PUT)
router.put("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const updatedInsumo = await Insumos.findByIdAndUpdate(id, req.body, {
      new: true,
    });
    if (!updatedInsumo) {
      return res.status(404).send({ message: "Insumo not found" });
    }
    res.status(200).send({ message: "Insumo updated", data: updatedInsumo });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// Eliminar un Insumo (DELETE)
router.delete("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const deletedInsumo = await Insumos.findByIdAndDelete(id);
    if (!deletedInsumo) {
      return res.status(404).send({ message: "Insumo not found" });
    }
    res.status(200).send({ message: "Insumo deleted" });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

module.exports = router;
