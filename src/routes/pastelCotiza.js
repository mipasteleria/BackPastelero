const express = require("express");
const router = express.Router();
const Prices = require("../models/pastelCotiza");
const checkRoleToken = require("../middlewares/myRoleToken");

//Enviar Cotización Cake
router.post("/", async (req, res) => {
  try {
    let price = req.body;
    const newPrice = await Prices.create(price);
    await newPrice.save();
    res.status(201).send({ message: "Price Cake created", data: newPrice });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

//Recuperar Datos Cotización Cake
router.get("/", checkRoleToken, async (req, res) => {
  try {
    const pricesData = await Prices.find();
    res.send({ message: "All Prices Cake", data: pricesData });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

//Obtener Cotizaciones por ID Cake
router.get("/:id", checkRoleToken, async (req, res) => {
  try {
    const { id } = req.params;
    const pricesid = await Prices.findById({ _id: id });
    res.send({ message: "Price Cake by ID", data: pricesid });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

//Actualiza Cotizacion por ID Cake
router.put("/:id", checkRoleToken, async (req, res) => {
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

//Borra Cotizacion por ID Cake
router.delete("/:id", checkRoleToken, async (req, res) => {
  try {
    const { id } = req.params;
    await Prices.findByIdAndDelete(id);
    res.send({ message: "Price deleted" });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

module.exports = router;
