const express = require("express");
const router = express.Router();
const HomeConfig = require("../models/homeConfig");
const checkRoleToken = require("../middlewares/myRoleToken");

/**
 * Singleton helper — devuelve la única doc de HomeConfig, creándola con
 * defaults la primera vez. Así el front nunca recibe 404 y el admin no
 * tiene que "crearla" manualmente.
 */
async function getOrCreateHomeConfig() {
  let cfg = await HomeConfig.findOne();
  if (!cfg) cfg = await HomeConfig.create({});
  return cfg;
}

/**
 * GET /home-config — público. Lo consume el index.jsx en cada render.
 */
router.get("/", async (req, res) => {
  try {
    const cfg = await getOrCreateHomeConfig();
    res.json({
      data: {
        imagenHeroUrl:      cfg.imagenHeroUrl || "",
        imagenHeroFileName: cfg.imagenHeroFileName || "",
        favoritoSemanaHref: cfg.favoritoSemanaHref || "/enduser/galletas-ny",
        nuevoSaborHref:     cfg.nuevoSaborHref || "/enduser/galletas-ny",
      },
    });
  } catch (error) {
    console.error("Error leyendo home-config:", error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * PUT /home-config — admin. Body acepta cualquier subconjunto de los
 * campos editables (los no enviados se preservan).
 *
 * Para imagenHero, el flujo es:
 *   1. Front sube archivo a POST /upload (que ya existe) → recibe { fileUrl, fileName }
 *   2. Front envía PUT /home-config { imagenHeroUrl: fileUrl, imagenHeroFileName: fileName }
 *
 * Si se quiere "quitar" la imagen, enviar imagenHeroUrl: "" (también limpia fileName).
 */
router.put("/", checkRoleToken("admin"), async (req, res) => {
  try {
    const cfg = await getOrCreateHomeConfig();
    const { imagenHeroUrl, imagenHeroFileName, favoritoSemanaHref, nuevoSaborHref } = req.body || {};

    if (typeof imagenHeroUrl === "string") {
      cfg.imagenHeroUrl = imagenHeroUrl.trim();
      // Si limpian la URL pero no mandaron fileName, también limpiar fileName.
      if (!cfg.imagenHeroUrl) cfg.imagenHeroFileName = "";
    }
    if (typeof imagenHeroFileName === "string") {
      cfg.imagenHeroFileName = imagenHeroFileName.trim();
    }
    if (typeof favoritoSemanaHref === "string") {
      cfg.favoritoSemanaHref = favoritoSemanaHref.trim() || "/enduser/galletas-ny";
    }
    if (typeof nuevoSaborHref === "string") {
      cfg.nuevoSaborHref = nuevoSaborHref.trim() || "/enduser/galletas-ny";
    }

    await cfg.save();
    res.json({
      message: "Configuración actualizada",
      data: {
        imagenHeroUrl:      cfg.imagenHeroUrl,
        imagenHeroFileName: cfg.imagenHeroFileName,
        favoritoSemanaHref: cfg.favoritoSemanaHref,
        nuevoSaborHref:     cfg.nuevoSaborHref,
      },
    });
  } catch (error) {
    console.error("Error actualizando home-config:", error);
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
