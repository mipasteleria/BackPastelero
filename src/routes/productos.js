const express = require("express");
const router = express.Router();
const Producto = require("../models/producto");
const checkRoleToken = require("../middlewares/myRoleToken");

// Listar productos activos — público
router.get("/", async (req, res) => {
  try {
    const filter = req.query.todos === "true" ? {} : { activo: true };
    const productos = await Producto.find(filter).sort({ orden: 1, createdAt: 1 });
    res.json({ message: "Productos", data: productos });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Obtener un producto — público
router.get("/:id", async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id);
    if (!producto) return res.status(404).json({ message: "Producto no encontrado" });
    res.json({ message: "Producto", data: producto });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Crear producto — solo admin
router.post("/", checkRoleToken("admin"), async (req, res) => {
  try {
    const { nombre, descripcion, fotos, orden, activo } = req.body;
    if (!nombre) return res.status(400).json({ message: "El nombre es requerido" });
    const producto = await Producto.create({ nombre, descripcion, fotos: fotos || [], orden: orden ?? 0, activo: activo ?? true });
    res.status(201).json({ message: "Producto creado", data: producto });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Actualizar producto — solo admin
router.put("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const producto = await Producto.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!producto) return res.status(404).json({ message: "Producto no encontrado" });
    res.json({ message: "Producto actualizado", data: producto });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Eliminar producto — solo admin
router.delete("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    await Producto.findByIdAndDelete(req.params.id);
    res.json({ message: "Producto eliminado" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
