const express = require("express");
const router = express.Router();
const Prices = require("../models/cupcakesCotiza");
const checkRoleToken = require("../middlewares/myRoleToken");

//Enviar Cotización Cupcake
router.post("/", async (req, res) => {
  try {
    const { images, ...priceDetails } = req.body;
    const newPrice = await Prices.create({
      ...priceDetails,
      images: images,
    });
    await newPrice.save();
    res.status(201).send({ message: "Price cupcake created", data: newPrice });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

//Recuperar Datos Cotización Cupcake
router.get("/", async (req, res) => {
  try {
    const pricesData = await Prices.find();
    res.send({ message: "All Prices cupcake", data: pricesData });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

//Obtener Cotizaciones por ID Cupcake
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const pricesid = await Prices.findById({ _id: id });
    res.send({ message: "Price by ID cupcake", data: pricesid });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

//Actualiza Cotizacion por ID Cupcake
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const newPrice = req.body;
    const newPrices = await Prices.findByIdAndUpdate(id, newPrice, {
      returnOriginal: false,
    });
    res.send({ message: "Price updated", data: newPrices });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

//Borra Cotizacion por ID Cupcake
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await Prices.findByIdAndDelete(id);
    res.send({ message: "Price deleted" });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

module.exports = router;
