const express = require("express");
const router = express.Router();
const { Storage } = require("@google-cloud/storage");
const HomeConfig = require("../models/homeConfig");
const checkRoleToken = require("../middlewares/myRoleToken");

// Cliente de GCS para poder borrar el archivo de la imagen previa cuando
// se reemplaza. Reutilizamos la misma config que index.js (PROJECT_ID +
// GCS_CREDENTIALS + BUCKET_NAME).
let gcs = null;
try {
  const credentials = process.env.GCS_CREDENTIALS ? JSON.parse(process.env.GCS_CREDENTIALS) : undefined;
  gcs = new Storage({ projectId: process.env.PROJECT_ID, credentials });
} catch (e) {
  console.error("[home-config] GCS init failed — file cleanup disabled:", e.message);
}
const BUCKET = process.env.BUCKET_NAME;

/**
 * Borra un archivo de GCS si existe. Silencioso ante errores: si falla,
 * solo logea y sigue — un archivo huérfano en el bucket es preferible a
 * romper el flujo de actualizar la config del home.
 */
async function borrarArchivoGCS(fileName) {
  if (!gcs || !BUCKET || !fileName) return;
  try {
    await gcs.bucket(BUCKET).file(fileName).delete({ ignoreNotFound: true });
  } catch (e) {
    console.error(`[home-config] No se pudo borrar archivo viejo ${fileName}:`, e.message);
  }
}

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

    // Guardamos el fileName previo para poder borrarlo de GCS si se
    // reemplaza o se quita — evita acumular imágenes huérfanas en el bucket.
    const fileNamePrevio = cfg.imagenHeroFileName || "";

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

    // Si el fileName cambió (reemplazo o quitar imagen), borrar el viejo
    // de GCS. Lo hacemos DESPUÉS de save() para no perder la referencia si
    // GCS falla, y dentro de un try/catch silencioso para no romper la
    // respuesta exitosa al admin si el cleanup falla.
    if (fileNamePrevio && fileNamePrevio !== cfg.imagenHeroFileName) {
      borrarArchivoGCS(fileNamePrevio); // fire-and-forget (no await)
    }

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
