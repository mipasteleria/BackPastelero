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

// Actualizar (o crear si no existe) el único documento de costos — solo admin.
// `fixedCosts` y `laborCosts` siguen siendo requeridos (compat con el form
// existente de gastosfijosymanodeobra). Los 3 campos de galletas
// (`costoBrandingPorGalleta`, `markupGalletasPct`, `margenMinimoGalleta`)
// son opcionales — solo se actualizan si vienen en el body. Esto permite
// que el front mande payloads parciales sin pisar valores existentes.
router.put('/', checkRoleToken('admin'), async (req, res) => {
  try {
    const {
      fixedCosts, laborCosts,
      costoBrandingPorGalleta, markupGalletasPct, margenMinimoGalleta,
      costoBrandingPorPostre, markupPostresPct,
      pasarela,
    } = req.body;

    // `fixedCosts` y `laborCosts` son OPCIONALES a propósito.
    //
    // Antes eran obligatorios, así que las secciones del form que no los
    // editan (galletas, postres, pasarela) los reenviaban tomándolos del
    // estado de la página — y si ese estado aún traía los ceros iniciales,
    // guardar cualquiera de esas secciones borraba las tarifas por hora.
    // Pasó en producción: quedaron en 0 y con eso toda receta que se
    // reguardara habría salido sin mano de obra ni gastos fijos.
    //
    // Ahora cada sección manda solo lo suyo y lo que no viene no se toca.
    const update = {};
    if (fixedCosts  !== undefined) update.fixedCosts  = fixedCosts;
    if (laborCosts  !== undefined) update.laborCosts  = laborCosts;
    if (costoBrandingPorGalleta !== undefined) update.costoBrandingPorGalleta = costoBrandingPorGalleta;
    if (markupGalletasPct       !== undefined) update.markupGalletasPct       = markupGalletasPct;
    if (margenMinimoGalleta     !== undefined) update.margenMinimoGalleta     = margenMinimoGalleta;
    if (costoBrandingPorPostre  !== undefined) update.costoBrandingPorPostre  = costoBrandingPorPostre;
    if (markupPostresPct        !== undefined) update.markupPostresPct        = markupPostresPct;
    // Pasarela: campo por campo con notación de punto, para que mandar
    // solo `incluirEnPrecio` no borre las tarifas ya capturadas.
    if (pasarela && typeof pasarela === "object") {
      for (const k of ["proveedor", "comisionPct", "comisionFija", "ivaSobreComisionPct", "incluirEnPrecio"]) {
        if (pasarela[k] !== undefined) update[`pasarela.${k}`] = pasarela[k];
      }
    }
    const cost = await Cost.findOneAndUpdate(
      {},
      update,
      { upsert: true, new: true }
    );
    res.json(cost);
  } catch (error) {
    console.error("Error actualizando costos:", error);
    res.status(500).json({ message: "Error al actualizar los costos" });
  }
});

module.exports = router;
