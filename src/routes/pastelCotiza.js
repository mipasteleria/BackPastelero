const express = require("express");
const router = express.Router();
const Prices = require("../models/pastelCotiza");

//Enviar Cotización
router.post("/", async (req, res) => {
  try {
    let price = req.body;
    const newPrice = await Prices.create(price);
    await newPrice.save();
    res.status(201).send({ message: "Price created", data: newPrice });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

//Recuperar Datos Cotización
router.get("/", async (req, res) => {
  try {
    const pricesData = await Prices.find();
    res.send({ message: "All Prices", data: pricesData });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

//Obtener Cotizaciones por ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const pricesid = await Prices.findById({ _id: id });
    res.send({ message: "Price by ID", data: pricesid });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

module.exports = router;
