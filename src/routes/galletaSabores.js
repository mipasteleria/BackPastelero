const express = require("express");
const router = express.Router();
const GalletaSabor = require("../models/galletaSabor");
const checkRoleToken = require("../middlewares/myRoleToken");

/**
 * Rutas de Sabores de Galleta NY.
 *
 * Lectura pública (la página `/enduser/galletas-ny` necesita ver el
 * catálogo sin autenticación). Mutaciones solo admin.
 */

// ── GET /galletaSabores — listar sabores ────────────────────────────
// Público. Por defecto solo devuelve activos. Admin puede pasar ?todos=true.
router.get("/", async (req, res) => {
  try {
    const filter = req.query.todos === "true" ? {} : { activo: true };
    const sabores = await GalletaSabor.find(filter).sort({ orden: 1, createdAt: 1 });
    res.json({ message: "Sabores de galleta", data: sabores });
  } catch (error) {
    console.error("Error listando sabores galletas:", error);
    res.status(500).json({ message: error.message });
  }
});

// ── GET /galletaSabores/:id ─────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const sabor = await GalletaSabor.findById(req.params.id);
    if (!sabor) return res.status(404).json({ message: "Sabor no encontrado" });
    res.json({ message: "Sabor", data: sabor });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── POST /galletaSabores — crear sabor (admin) ──────────────────────
// Toma slug, nombre, precio, stock inicial y opcionalmente imagen/tags.
router.post("/", checkRoleToken("admin"), async (req, res) => {
  try {
    const {
      slug, nombre, descripcion, precio, stock,
      imagen, emoji, bg, tag, tagColor, tagText,
      esTemporada, activo, orden,
    } = req.body;

    if (!slug || !nombre || precio == null) {
      return res.status(400).json({ message: "slug, nombre y precio son requeridos" });
    }

    const sabor = await GalletaSabor.create({
      slug:        String(slug).toLowerCase().trim(),
      nombre,
      descripcion: descripcion || "",
      precio:      Number(precio),
      stock:       Number(stock) || 0,
      imagen:      imagen || "",
      emoji:       emoji || "🍪",
      bg:          bg || "linear-gradient(135deg,#FFE2E7,#FFC3C9)",
      tag:         tag || "",
      tagColor:    tagColor || "",
      tagText:     tagText || "",
      esTemporada: !!esTemporada,
      activo:      activo !== false,
      orden:       Number(orden) || 0,
    });

    res.status(201).json({ message: "Sabor creado", data: sabor });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Ya existe un sabor con ese slug" });
    }
    res.status(400).json({ message: error.message });
  }
});

// ── PUT /galletaSabores/:id — actualizar (admin) ────────────────────
// Permite tocar todos los campos. Si quieres SOLO ajustar stock, usa el
// endpoint dedicado /:id/stock — es seguro contra race conditions.
router.put("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    // Bloqueamos cambio directo de slug post-creación (rompería historial).
    const { slug: _ignore, ...payload } = req.body;
    const sabor = await GalletaSabor.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!sabor) return res.status(404).json({ message: "Sabor no encontrado" });
    res.json({ message: "Sabor actualizado", data: sabor });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── PATCH /galletaSabores/:id/stock — ajustar stock atómicamente ────
// Body: { delta: +25 } para sumar, { delta: -3 } para restar, o
//       { stock: 50 } para fijar valor absoluto.
// Atómico: usa $inc o $set sin race conditions.
router.patch("/:id/stock", checkRoleToken("admin"), async (req, res) => {
  try {
    const { delta, stock } = req.body || {};
    let update;

    if (typeof delta === "number") {
      update = { $inc: { stock: delta } };
    } else if (typeof stock === "number" && stock >= 0) {
      update = { $set: { stock } };
    } else {
      return res.status(400).json({ message: "Envía { delta: number } o { stock: number >= 0 }" });
    }

    const sabor = await GalletaSabor.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!sabor) return res.status(404).json({ message: "Sabor no encontrado" });

    // Si por error se permitió bajar a negativo, lo corregimos a 0.
    if (sabor.stock < 0) {
      sabor.stock = 0;
      await sabor.save();
    }

    res.json({ message: "Stock actualizado", data: sabor });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ── DELETE /galletaSabores/:id — soft-delete (admin) ────────────────
// Por defecto hace soft-delete (activo=false). Para borrado físico
// pasar ?force=true.
router.delete("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    if (req.query.force === "true") {
      await GalletaSabor.findByIdAndDelete(req.params.id);
      return res.json({ message: "Sabor eliminado permanentemente" });
    }
    const sabor = await GalletaSabor.findByIdAndUpdate(
      req.params.id,
      { activo: false },
      { new: true }
    );
    if (!sabor) return res.status(404).json({ message: "Sabor no encontrado" });
    res.json({ message: "Sabor desactivado", data: sabor });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
