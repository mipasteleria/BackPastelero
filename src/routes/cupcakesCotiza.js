const express = require("express");
const router = express.Router();
const Prices = require("../models/cupcakesCotiza");
const checkRoleToken = require("../middlewares/myRoleToken");
const { requireAuth } = checkRoleToken;
const { calcularCosteo } = require("../jobs/costeoHandler");

//Enviar Cotización Cupcake
router.post("/", async (req, res) => {
  console.log("entra al backend");
  try {
    let price = req.body;
    const newPrice = await Prices.create(price);
    await newPrice.save();
    res.status(201).send({ message: "Price cupcake created", data: newPrice });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

//Recuperar Datos Cotización Cupcake — admin ve todo, user solo sus propias
router.get("/", requireAuth, async (req, res) => {
  try {
    const filter = req.user.role === "admin" ? {} : { userId: String(req.user._id) };
    const pricesData = await Prices.find(filter);
    res.send({ message: "All Prices cupcake", data: pricesData, total: pricesData.length });
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

//Actualiza Cotizacion por ID Cupcake — solo admin
router.put("/:id", checkRoleToken("admin"), async (req, res) => {
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

//Borra Cotizacion por ID Cupcake — solo admin
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
