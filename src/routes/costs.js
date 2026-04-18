const express = require('express');
const router = express.Router();
const Cost = require('../models/costs');
const checkRoleToken = require('../middlewares/myRoleToken');

// Crear un nuevo costo (POST) — solo admin
router.post('/', checkRoleToken('admin'), async (req, res) => {
  try {
    const { fixedCosts, laborCosts } = req.body;

    if (fixedCosts === undefined || laborCosts === undefined) {
      return res.status(400).json({ message: "Parámetros 'fixedCosts' y 'laborCosts' son requeridos" });
    }

    const newCost = new Cost({ fixedCosts, laborCosts });
    await newCost.save();

    res.status(201).json(newCost);
  } catch (error) {
    console.error("Error creando costo:", error);
    res.status(500).json({ message: "Error al crear el costo" });
  }
});

// Obtener un costo por ID (GET)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cost = await Cost.findById(id);

    if (!cost) {
      return res.status(404).json({ message: "Costo no encontrado" });
    }

    res.json(cost);
  } catch (error) {
    console.error("Error obteniendo el costo:", error);
    res.status(500).json({ message: "Error al obtener el costo" });
  }
});

// Actualizar un costo por ID (PUT) — solo admin
router.put('/:id', checkRoleToken('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { fixedCosts, laborCosts } = req.body;

    if (fixedCosts === undefined || laborCosts === undefined) {
      return res.status(400).json({ message: "Parámetros 'fixedCosts' y 'laborCosts' son requeridos" });
    }

    const cost = await Cost.findById(id);

    if (!cost) {
      return res.status(404).json({ message: "Costo no encontrado" });
    }

    cost.fixedCosts = fixedCosts;
    cost.laborCosts = laborCosts;
    await cost.save();

    res.json(cost);
  } catch (error) {
    console.error("Error actualizando el costo:", error);
    res.status(500).json({ message: "Error al actualizar el costo" });
  }
});

// Obtener el único documento de costos sin conocer su ID
router.get('/', async (req, res) => {
  try {
    const cost = await Cost.findOne();
    if (!cost) return res.status(404).json({ message: "No hay costos configurados" });
    res.json(cost);
  } catch (error) {
    console.error("Error obteniendo costos:", error);
    res.status(500).json({ message: "Error al obtener los costos" });
  }
});

// Actualizar (o crear si no existe) el único documento de costos — solo admin
router.put('/', checkRoleToken('admin'), async (req, res) => {
  try {
    const { fixedCosts, laborCosts } = req.body;
    if (fixedCosts === undefined || laborCosts === undefined) {
      return res.status(400).json({ message: "Parámetros 'fixedCosts' y 'laborCosts' son requeridos" });
    }
    const cost = await Cost.findOneAndUpdate(
      {},
      { fixedCosts, laborCosts },
      { upsert: true, new: true }
    );
    res.json(cost);
  } catch (error) {
    console.error("Error actualizando costos:", error);
    res.status(500).json({ message: "Error al actualizar los costos" });
  }
});

module.exports = router;
