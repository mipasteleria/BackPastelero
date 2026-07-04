const mongoose = require("mongoose");

/**
 * Curso — en línea (video pre-grabado) o presencial (grabado en clase).
 * Ambas modalidades soportan video y descargables. El video se transcodifica
 * a HLS/DASH con Google Transcoder (ver utils/transcoder.js).
 */
const capituloSchema = new mongoose.Schema(
  { titulo: { type: String, default: "" }, segundos: { type: Number, default: 0 } },
  { _id: false }
);

const descargableSchema = new mongoose.Schema(
  { nombre: { type: String, default: "" }, url: { type: String, default: "" } },
  { _id: false }
);

const videoSchema = new mongoose.Schema(
  {
    estado: { type: String, enum: ["sin_video", "procesando", "listo", "error"], default: "sin_video" },
    gcsInputPath: { type: String, default: "" },   // cursos/raw/xxx.mp4
    outputPrefix: { type: String, default: "" },   // cursos/out/<leccionId>/
    jobName:      { type: String, default: "" },   // Transcoder job
    errorMsg:     { type: String, default: "" },
    duracionSeg:  { type: Number, default: 0 },
    thumbnailUrl: { type: String, default: "" },   // elegido por el admin
    captionsUrl:  { type: String, default: "" },   // .vtt subido por el admin
    capitulos:    { type: [capituloSchema], default: [] }, // saltos del player
  },
  { _id: false }
);

const leccionSchema = new mongoose.Schema({
  titulo:      { type: String, required: true, trim: true },
  descripcion: { type: String, default: "" },
  orden:       { type: Number, default: 0 },
  video:       { type: videoSchema, default: () => ({}) },
  descargables:{ type: [descargableSchema], default: [] },
});

const cursoSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^[a-z0-9-]+$/, "Slug inválido"] },
    titulo:      { type: String, required: true, trim: true },
    descripcion: { type: String, default: "" },
    precio:      { type: Number, default: 0, min: 0 },
    thumbnailUrl:{ type: String, default: "" },

    // Modalidad: en línea (pre-grabado) o presencial (grabado en la clase).
    modalidad: { type: String, enum: ["en-linea", "presencial"], default: "en-linea" },
    // Solo presencial:
    fechaClase: { type: Date, default: null },
    lugar:      { type: String, default: "" },
    cupo:       { type: Number, default: 0 },

    lecciones: { type: [leccionSchema], default: [] },

    activo: { type: Boolean, default: false }, // se publica cuando está listo
    orden:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Curso", cursoSchema);
