const express = require("express");
require("dotenv").config();
const { Storage } = require("@google-cloud/storage");
const multer = require("multer");
const mongoose = require("mongoose");
const app = express();
const port = process.env.PORT || 3001;
const crypto = require("crypto");
const path = require("path");
const checkRoleToken = require("./src/middlewares/myRoleToken.js");
const { requireAuth } = checkRoleToken;
const mongoDB = require("./src/database/db.js");
const { startReminderCron } = require("./src/jobs/reminderCron");
const usersRoutes = require("./src/routes/users.js");
const pricesCakeRoutes = require("./src/routes/pastelCotiza.js");
const pricesCupcakesRoutes = require("./src/routes/cupcakesCotiza.js");
const pricesSnackRoutes = require("./src/routes/snackCotiza.js");
const insumosRoutes = require("./src/routes/insumos.js");
const recetasRoutes = require("./src/routes/recetas");
const ingredientesRoutes = require("./src/routes/recetas/ingredientes");
const notificacionesRoutes = require("./src/routes/notificaciones");
const costsRoutes = require("./src/routes/costs.js");
const tecnicasCreativasRoutes = require("./src/routes/tecnicasCreativas.js");
const productosRoutes = require("./src/routes/productos.js");
const createCheckoutSession = require("./src/routes/create-payment-intent/server.js");
const stripeWebhook = require("./src/routes/create-payment-intent/webhook.js");
const sendConfirmationEmail = require("./src/routes/create-payment-intent/confirmationEmail.js");
const cors = require("cors");

// Lista blanca de orígenes permitidos. Se configura con ALLOWED_ORIGINS
// como CSV en el .env, p.ej.
//   ALLOWED_ORIGINS=https://front-pastelero.vercel.app,http://localhost:3000
// Sin credenciales cruzadas con origin:"*" (el navegador lo rechaza).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Permitir requests sin Origin (ej. curl, health checks del hosting)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// IMPORTANTE: el webhook de Stripe debe recibir el body CRUDO para que la
// verificación de firma HMAC funcione. Se monta con express.raw ANTES de
// express.json(), que de lo contrario transformaría el buffer y rompería
// la firma. Cualquier otra ruta sigue usando JSON como siempre.
app.use("/webhook/stripe", express.raw({ type: "application/json" }), stripeWebhook);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/users", usersRoutes);
app.use("/pricecake", pricesCakeRoutes);
app.use("/pricecupcake", pricesCupcakesRoutes);
app.use("/pricesnack", pricesSnackRoutes);
app.use("/insumos", insumosRoutes);
app.use("/recetas", recetasRoutes);
app.use("/recetas/ingredientes", ingredientesRoutes);
app.use("/checkout", createCheckoutSession);
app.use("/costs", costsRoutes);
app.use("/tecnicas", tecnicasCreativasRoutes);
app.use("/productos", productosRoutes);
app.use("/send-confirmation-email", sendConfirmationEmail);
app.use("/notificaciones", notificacionesRoutes);
app.get("/", (req, res) => {
  res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Estás en Línea</title>
            <style>
                body {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background-color: #f0f4f8;
                    font-family: Arial, sans-serif;
                    text-align: center;
                }
                .container {
                    background-color: #ffffff;
                    border-radius: 8px;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                    padding: 20px;
                    max-width: 400px;
                    width: 100%;
                }
                h1 {
                    color: #333333;
                    margin-bottom: 20px;
                }
                p {
                    color: #555555;
                    font-size: 1.1em;
                }
                .button {
                    display: inline-block;
                    margin-top: 20px;
                    padding: 10px 20px;
                    background-color: #007bff;
                    color: #ffffff;
                    text-decoration: none;
                    border-radius: 4px;
                    font-size: 1em;
                    transition: background-color 0.3s ease;
                }
                .button:hover {
                    background-color: #0056b3;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>¡Estás en Línea!</h1>
                <p>Tu backend está funcionando correctamente. Si ves este mensaje, significa que todo está configurado bien.</p>
                <a href="/" class="button">Volver al Inicio</a>
            </div>
        </body>
        </html>
    `);
});

const storage = new Storage({
  projectId: process.env.PROJECT_ID,
  credentials: process.env.GCS_CREDENTIALS
    ? JSON.parse(process.env.GCS_CREDENTIALS)
    : undefined,
});

const bucketName = process.env.BUCKET_NAME;

// Configuración de multer para usar Google Cloud Storage directamente.
// Validamos tipo (sólo imágenes web) y tamaño (8 MB por archivo, 5 archivos).
// Así evitamos que cualquiera suba un ejecutable o un archivo de 2 GB.
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024, // 8 MB
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error("Tipo de archivo no permitido. Solo JPG, PNG, WEBP o GIF."));
  },
});

// Construye un nombre de archivo seguro para GCS: sólo basename (sin `../`),
// prefijo random para evitar que un segundo upload sobrescriba al primero,
// y extensión validada contra el mimetype.
function buildSafeFileName(file) {
  const ext = (path.extname(file.originalname) || "").toLowerCase().slice(0, 5);
  const base = path
    .basename(file.originalname, path.extname(file.originalname))
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 60);
  const rand = crypto.randomBytes(6).toString("hex");
  return `${Date.now()}-${rand}-${base}${ext}`;
}

async function uploadFileToGCS(file, bucketName) {
  const bucket = storage.bucket(bucketName);
  const safeName = buildSafeFileName(file);
  const blob = bucket.file(safeName);
  const blobStream = blob.createWriteStream({
    resumable: false,
    gzip: true,
    metadata: { contentType: file.mimetype },
  });

  return new Promise((resolve, reject) => {
    blobStream.on("error", (err) => reject(err));
    blobStream.on("finish", () => {
      const publicUrl = `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(safeName)}`;
      resolve({ message: "File uploaded successfully", fileUrl: publicUrl, fileName: safeName });
    });
    blobStream.end(file.buffer);
  });
}

// Subir imagen. Requiere estar autenticado (cualquier rol).
// El fileFilter de multer rechaza tipos no permitidos; aquí capturamos el error
// y devolvemos 400 en lugar de 500 genérico.
app.post("/upload", requireAuth, (req, res, next) => {
  upload.array("files")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files received" });
    }
    Promise.all(req.files.map((file) => uploadFileToGCS(file, bucketName)))
      .then((results) => res.status(200).json(results))
      .catch((e) => {
        console.error("Error uploading files:", e.message, e.code ?? "");
        res.status(500).json({ error: e.message || "Error uploading files" });
      });
  });
});

// Ver imagen
app.get("/image-url/:filename", async (req, res) => {
  try {
    const fileName = req.params.filename;
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 60 * 60 * 1000, // 1 hora
    });

    res.status(200).json({ url });
  } catch (error) {
    console.error("Error generating signed URL:", error);
    res.status(500).json({ error: "Error generating signed URL" });
  }
});

mongoDB.connect
  .then((message) => {
    console.log(message);
    startReminderCron();
    app.listen(port, () => {
      console.log("Server is listening on port", port);
    });
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
  });

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ message: "Something broke!" });
});
