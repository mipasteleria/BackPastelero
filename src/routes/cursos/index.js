const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { Storage } = require("@google-cloud/storage");
const Curso = require("../../models/cursos/curso");
const CursoCompra = require("../../models/cursos/compra");
const checkRoleToken = require("../../middlewares/myRoleToken");
const { crearJob, estadoJob } = require("../../utils/transcoder");

const BUCKET = process.env.BUCKET_NAME;

let storage = null;
try {
  const credentials = process.env.GCS_CREDENTIALS ? JSON.parse(process.env.GCS_CREDENTIALS) : undefined;
  storage = new Storage({ projectId: process.env.PROJECT_ID, credentials });
} catch (e) {
  console.error("[cursos] GCS init falló:", e.message);
}

/**
 * Cursos — API.
 *
 * Flujo de video (en línea o presencial, ambas llevan video):
 *  1. Admin pide POST /cursos/upload-url → URL firmada PUT (el video sube
 *     DIRECTO a GCS, sin pasar por Vercel: los videos pesan cientos de MB).
 *  2. Admin llama POST /cursos/:id/lecciones/:lid/transcodificar →
 *     Transcoder genera HLS+DASH (3 tamaños, segmentos 10 s).
 *  3. El dashboard sondea GET .../estado-video hasta "listo".
 */

// ── Público: catálogo (solo activos, sin rutas de video) ─────────
router.get("/", async (_req, res) => {
  try {
    const cursos = await Curso.find({ activo: true })
      .select("-lecciones.video.gcsInputPath -lecciones.video.jobName -lecciones.video.outputPrefix")
      .sort({ orden: 1, createdAt: -1 });
    res.json({ data: cursos });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Admin: todos ──────────────────────────────────────────────────
router.get("/admin", checkRoleToken("admin"), async (_req, res) => {
  try {
    const cursos = await Curso.find().sort({ orden: 1, createdAt: -1 });
    res.json({ data: cursos });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get("/admin/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const curso = await Curso.findById(req.params.id);
    if (!curso) return res.status(404).json({ message: "Curso no encontrado" });
    res.json({ data: curso });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post("/", checkRoleToken("admin"), async (req, res) => {
  try {
    const doc = await Curso.create(req.body);
    res.status(201).json({ message: "Curso creado", data: doc });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: "Ya existe un curso con ese slug" });
    res.status(400).json({ message: e.message });
  }
});

router.put("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const doc = await Curso.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: "Curso no encontrado" });
    res.json({ message: "Curso actualizado", data: doc });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const doc = await Curso.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Curso no encontrado" });
    res.json({ message: "Curso eliminado" });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

// ── Lecciones ─────────────────────────────────────────────────────
router.post("/:id/lecciones", checkRoleToken("admin"), async (req, res) => {
  try {
    const curso = await Curso.findById(req.params.id);
    if (!curso) return res.status(404).json({ message: "Curso no encontrado" });
    curso.lecciones.push({ titulo: req.body.titulo || "Lección", descripcion: req.body.descripcion || "", orden: curso.lecciones.length });
    await curso.save();
    res.status(201).json({ message: "Lección agregada", data: curso });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put("/:id/lecciones/:lid", checkRoleToken("admin"), async (req, res) => {
  try {
    const curso = await Curso.findById(req.params.id);
    if (!curso) return res.status(404).json({ message: "Curso no encontrado" });
    const lec = curso.lecciones.id(req.params.lid);
    if (!lec) return res.status(404).json({ message: "Lección no encontrada" });
    const permitidos = ["titulo", "descripcion", "orden", "descargables"];
    for (const k of permitidos) if (k in req.body) lec[k] = req.body[k];
    // Campos del video editables por el admin (thumbnail, captions, capítulos).
    if (req.body.video) {
      for (const k of ["thumbnailUrl", "captionsUrl", "capitulos"]) {
        if (k in req.body.video) lec.video[k] = req.body.video[k];
      }
    }
    await curso.save();
    res.json({ message: "Lección actualizada", data: curso });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete("/:id/lecciones/:lid", checkRoleToken("admin"), async (req, res) => {
  try {
    const curso = await Curso.findById(req.params.id);
    if (!curso) return res.status(404).json({ message: "Curso no encontrado" });
    const lec = curso.lecciones.id(req.params.lid);
    if (!lec) return res.status(404).json({ message: "Lección no encontrada" });
    lec.deleteOne();
    await curso.save();
    res.json({ message: "Lección eliminada", data: curso });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

// ── Subida directa de video a GCS (URL firmada) ───────────────────
router.post("/upload-url", checkRoleToken("admin"), async (req, res) => {
  try {
    if (!storage) return res.status(503).json({ message: "GCS no configurado" });
    const nombre = String(req.body?.fileName || "video.mp4").replace(/[^A-Za-z0-9._-]/g, "-");
    const contentType = String(req.body?.contentType || "video/mp4");
    const path = `cursos/raw/${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${nombre}`;
    const [url] = await storage.bucket(BUCKET).file(path).getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 60 * 60 * 1000, // 1 h para subir
      contentType,
    });
    res.json({ uploadUrl: url, gcsPath: path, contentType });
  } catch (e) {
    console.error("[cursos] upload-url:", e.message);
    res.status(500).json({ message: e.message });
  }
});

// ── Transcodificar la lección ─────────────────────────────────────
router.post("/:id/lecciones/:lid/transcodificar", checkRoleToken("admin"), async (req, res) => {
  try {
    const { gcsPath } = req.body || {};
    if (!gcsPath) return res.status(400).json({ message: "Falta gcsPath del video subido" });
    const curso = await Curso.findById(req.params.id);
    if (!curso) return res.status(404).json({ message: "Curso no encontrado" });
    const lec = curso.lecciones.id(req.params.lid);
    if (!lec) return res.status(404).json({ message: "Lección no encontrada" });

    const outputPrefix = `cursos/out/${lec._id}/`;
    const jobName = await crearJob(`gs://${BUCKET}/${gcsPath}`, `gs://${BUCKET}/${outputPrefix}`);

    lec.video.estado = "procesando";
    lec.video.gcsInputPath = gcsPath;
    lec.video.outputPrefix = outputPrefix;
    lec.video.jobName = jobName;
    lec.video.errorMsg = "";
    await curso.save();

    res.json({ message: "Transcodificación iniciada", data: { jobName } });
  } catch (e) {
    console.error("[cursos] transcodificar:", e.message);
    res.status(500).json({ message: e.message });
  }
});

// ── Estado del video (el dashboard sondea) ────────────────────────
router.get("/:id/lecciones/:lid/estado-video", checkRoleToken("admin"), async (req, res) => {
  try {
    const curso = await Curso.findById(req.params.id);
    if (!curso) return res.status(404).json({ message: "Curso no encontrado" });
    const lec = curso.lecciones.id(req.params.lid);
    if (!lec) return res.status(404).json({ message: "Lección no encontrada" });
    if (lec.video.estado !== "procesando" || !lec.video.jobName) {
      return res.json({ data: { estado: lec.video.estado, error: lec.video.errorMsg } });
    }
    const { state, error } = await estadoJob(lec.video.jobName);
    if (state === "SUCCEEDED") {
      lec.video.estado = "listo";
      await curso.save();
    } else if (state === "FAILED") {
      lec.video.estado = "error";
      lec.video.errorMsg = error || "Transcodificación fallida";
      await curso.save();
    }
    res.json({ data: { estado: lec.video.estado, jobState: state, error: lec.video.errorMsg } });
  } catch (e) {
    console.error("[cursos] estado-video:", e.message);
    res.status(500).json({ message: e.message });
  }
});

// ── Token de reproducción ─────────────────────────────────────────
// El player no puede mandar headers de auth en los requests de segmentos,
// así que el acceso se firma EN LA RUTA: /video-stream/<token>/<path>.
// token = base64url(exp.prefijoHex.hmac) — cubre todo el outputPrefix,
// por lo que el manifest y sus segmentos relativos quedan autorizados.

function firmarAcceso(prefix, ttlSeg = 6 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeg;
  const prefixHex = Buffer.from(prefix).toString("hex");
  const h = crypto.createHmac("sha256", process.env.JWT_SIGN || "dev").update(`${exp}.${prefix}`).digest("hex").slice(0, 32);
  return Buffer.from(`${exp}.${prefixHex}.${h}`).toString("base64url");
}

function verificarAcceso(token, path) {
  try {
    const [expStr, prefixHex, h] = Buffer.from(token, "base64url").toString().split(".");
    const exp = Number(expStr);
    const prefix = Buffer.from(prefixHex, "hex").toString();
    if (!exp || Date.now() / 1000 > exp) return false;
    if (!path.startsWith(prefix)) return false;
    const expected = crypto.createHmac("sha256", process.env.JWT_SIGN || "dev").update(`${exp}.${prefix}`).digest("hex").slice(0, 32);
    return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(expected));
  } catch { return false; }
}

// ¿Este usuario tiene acceso al curso? (admin, compra pagada, o cortesía)
async function tieneAcceso(req, curso) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return false;
  try {
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(token, process.env.JWT_SIGN);
    if (decoded?.role === "admin") return true;
    const ahora = new Date();
    const compra = await CursoCompra.findOne({
      cursoId: curso._id,
      status: "paid",
      $or: [{ userId: String(decoded._id || decoded.id || "") }, { email: decoded.email || "__" }],
    });
    if (!compra) return false;
    if (compra.expiraAt && compra.expiraAt < ahora) return false;
    return true;
  } catch { return false; }
}

// URL de reproducción firmada (admin para preview; compradores en Fase 3).
router.get("/:id/lecciones/:lid/play", async (req, res) => {
  try {
    const curso = await Curso.findById(req.params.id);
    if (!curso) return res.status(404).json({ message: "Curso no encontrado" });
    const lec = curso.lecciones.id(req.params.lid);
    if (!lec || lec.video.estado !== "listo") return res.status(404).json({ message: "Video no disponible" });
    if (!(await tieneAcceso(req, curso))) return res.status(403).json({ message: "Sin acceso a este curso" });

    const t = firmarAcceso(lec.video.outputPrefix);
    res.json({
      data: {
        hls: `/video-stream/${t}/${lec.video.outputPrefix}hls.m3u8`,
        dash: `/video-stream/${t}/${lec.video.outputPrefix}dash.mpd`,
        thumbnailUrl: lec.video.thumbnailUrl,
        captionsUrl: lec.video.captionsUrl,
        capitulos: lec.video.capitulos,
      },
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
module.exports.verificarAcceso = verificarAcceso;
