const express = require("express");
const router = express.Router();
const TecnicaCreativa = require("../models/tecnicaCreativa");
const checkRoleToken = require("../middlewares/myRoleToken");

// Crear técnica — solo admin
router.post("/", checkRoleToken("admin"), async (req, res) => {
  try {
    const tecnica = await TecnicaCreativa.create(req.body);
    res.status(201).json({ message: "Técnica creada", data: tecnica });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Listar técnicas activas (público) — el front las necesita al costear
router.get("/", async (req, res) => {
  try {
    const filter = req.query.todas === "true" ? {} : { activo: true };
    const tecnicas = await TecnicaCreativa.find(filter).sort({ categoria: 1, nombre: 1 });
    res.json({ data: tecnicas });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Obtener una por ID
router.get("/:id", async (req, res) => {
  try {
    const tecnica = await TecnicaCreativa.findById(req.params.id);
    if (!tecnica) return res.status(404).json({ message: "Técnica no encontrada" });
    res.json({ data: tecnica });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Actualizar — solo admin
router.put("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const tecnica = await TecnicaCreativa.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!tecnica) return res.status(404).json({ message: "Técnica no encontrada" });
    res.json({ message: "Técnica actualizada", data: tecnica });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Eliminar — solo admin
router.delete("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const tecnica = await TecnicaCreativa.findByIdAndDelete(req.params.id);
    if (!tecnica) return res.status(404).json({ message: "Técnica no encontrada" });
    res.json({ message: "Técnica eliminada" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
