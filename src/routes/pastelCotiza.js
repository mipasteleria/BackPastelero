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
    console.log("entra a error");
    res.status(400).send({ message: error });
  }
});

//Recuperar Datos Cotización Cake
router.get("/", async (req, res) => {
  try {
    const pricesData = await Prices.find();
    res.send({ message: "All Prices Cake", data: pricesData });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

//Obtener Cotizaciones por ID Cake
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const pricesid = await Prices.findById({ _id: id });
    res.send({ message: "Price Cake by ID", data: pricesid });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const newPrice = req.body;

    console.log('Received data for update:', newPrice);

    const updatedPrice = await Prices.findByIdAndUpdate(id, newPrice, {
      new: true,
      runValidators: true,
    });

    if (!updatedPrice) {
      return res.status(404).send({ message: "Price not found" });
    }

    res.send({ message: "Price updated", data: updatedPrice });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});


//Borra Cotizacion por ID Cake
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
