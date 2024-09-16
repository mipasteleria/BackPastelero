const express = require('express');
const router = express.Router();
const Cost = require('../models/costs');

// Crear un nuevo costo (POST)
router.post('/', async (req, res) => {
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

// Actualizar un costo por ID (PUT)
router.put('/:id', async (req, res) => {
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

module.exports = router;
