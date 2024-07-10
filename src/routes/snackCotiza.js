const express = require("express");
const router = express.Router();
const Prices = require("../models/snackCotiza");

//Enviar Cotización Snack
router.post("/", async (req, res) => {
  try {
    let price = req.body;
    const newPrice = await Prices.create(price);
    await newPrice.save();
    res.status(201).send({ message: "Price Snack created", data: newPrice });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

//Recuperar Datos Cotización Snack
router.get("/", async (req, res) => {
  try {
    const pricesData = await Prices.find();
    res.send({ message: "All Prices Snack", data: pricesData });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

//Obtener Cotizaciones por ID Snack
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const pricesid = await Prices.findById({ _id: id });
    res.send({ message: "Price by ID Snack", data: pricesid });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

module.exports = router;
