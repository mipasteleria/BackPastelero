const express = require("express");
const router = express.Router();
const Insumos = require("../models/insumos");

//Enviar Insumo
router.post("/", async (req, res) => {
  try {
    let insumo = req.body;
    const newInsumo = await Insumos.create(insumo);
    await newInsumo.save();
    res.status(201).send({ message: "Insumo created", data: newInsumo });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

module.exports = router;
