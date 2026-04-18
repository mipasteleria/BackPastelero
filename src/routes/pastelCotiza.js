const express = require("express");
const router = express.Router();
const Prices = require("../models/pastelCotiza");
const checkRoleToken = require("../middlewares/myRoleToken");
const { requireAuth } = checkRoleToken;
const { calcularCosteo } = require("../jobs/costeoHandler");

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

//Recuperar Datos Cotización Cake — admin ve todo, user solo sus propias
router.get("/", requireAuth, async (req, res) => {
  try {
    const filter = req.user.role === "admin" ? {} : { userId: String(req.user._id) };
    const pricesData = await Prices.find(filter);
    res.send({ message: "All Prices Cake", data: pricesData, total: pricesData.length });
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

// Actualizar cotización Cake — solo admin
router.put("/:id", checkRoleToken("admin"), async (req, res) => {
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


//Borra Cotizacion por ID Cake — solo admin
router.delete("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    await Prices.findByIdAndDelete(id);
    res.send({ message: "Price deleted" });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

// Calcular y guardar costeo — solo admin
// Body: { recetaId, tecnicaIds[], margenDeseado, ivaPercent? }
router.post("/:id/costeo", checkRoleToken("admin"), async (req, res) => {
  try {
    const cotizacion = await Prices.findById(req.params.id);
    if (!cotizacion) return res.status(404).json({ message: "Cotización no encontrada" });

    const porciones = parseInt(cotizacion.portions, 10);
    if (!porciones || porciones <= 0)
      return res.status(400).json({ message: "La cotización no tiene porciones válidas" });

    const snapshot = await calcularCosteo(cotizacion, porciones, req.body);
    res.json({ message: "Costeo calculado", data: snapshot });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
