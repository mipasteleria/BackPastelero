const express = require("express");
const router = express.Router();
const Insumos = require("../models/insumos");
const Receta = require("../models/recetas/recetas");
const checkRoleToken = require("../middlewares/myRoleToken");

// Enviar Insumo (POST) — solo admin
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
router.get("/", async (req, res) => {
  try {
    const insumos = await Insumos.find(); // Obtener todos los documentos
    res.status(200).send(insumos);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

router.get("/nombres", async (req, res) => {
  try {
    // Obtener solo los nombres de los documentos
    const nombres = await Insumos.find({}, "name"); // Obtener solo el campo 'name'
    res.status(200).send(nombres.map((insumo) => insumo.name));
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// Obtener un Insumo por ID (GET)
router.get("/:id", async (req, res) => {
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

// Actualizar un Insumo (PUT) — solo admin
// Tras actualizar, recalcula automáticamente el precio en todas las recetas
// que referencian este insumo mediante insumoId.
router.put("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const updatedInsumo = await Insumos.findByIdAndUpdate(id, req.body, { new: true });
    if (!updatedInsumo) return res.status(404).send({ message: "Insumo not found" });

    // Propagar nuevo precio a todas las recetas que usen este insumo
    const unitCost = updatedInsumo.cost / (updatedInsumo.amount || 1);
    const recetas = await Receta.find({ "ingredientes.insumoId": id });

    await Promise.all(recetas.map(async (receta) => {
      receta.ingredientes.forEach((ing) => {
        if (ing.insumoId?.toString() === id) {
          ing.precio = Math.round(unitCost * ing.cantidad * 100) / 100;
          ing.total  = Math.round(unitCost * 100) / 100;
        }
      });
      const ingTotal = receta.ingredientes.reduce((s, i) => s + (i.precio || 0), 0);
      const rawCost  = ingTotal + (receta.additional_costs || 0);
      receta.total_cost = Math.round((rawCost + rawCost * (receta.special_tax || 0) / 100) * 100) / 100;
      await receta.save();
    }));

    res.status(200).send({
      message: "Insumo updated",
      data: updatedInsumo,
      recetasActualizadas: recetas.length,
    });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// Eliminar un Insumo (DELETE) — solo admin
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
