const express = require("express");
require("dotenv").config();
const { Storage } = require("@google-cloud/storage");
const multer = require("multer");
const mongoose = require("mongoose");
const app = express();
const port = process.env.PORT || 3001;
const mongoDB = require("./src/database/db.js");
const usersRoutes = require("./src/routes/users.js");
const pricesCakeRoutes = require("./src/routes/pastelCotiza.js");
const pricesCupcakesRoutes = require("./src/routes/cupcakesCotiza.js");
const pricesSnackRoutes = require("./src/routes/snackCotiza.js");
const insumosRoutes = require("./src/routes/insumos.js");
const recetasRoutes = require("./src/routes/recetas");
const ingredientesRoutes = require("./src/routes/recetas/ingredientes");
const createCheckoutSession = require("./src/routes/create-payment-intent/server.js");
const cors = require("cors");

const corsOptions = {
  origin: "*",
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

app.use("/users", usersRoutes);
app.use("/pricecake", pricesCakeRoutes);
app.use("/pricecupcake", pricesCupcakesRoutes);
app.use("/pricesnack", pricesSnackRoutes);
app.use("/insumos", insumosRoutes);
app.use("/recetas", recetasRoutes);
app.use("/recetas/ingredientes", ingredientesRoutes);
app.use("/checkout", createCheckoutSession);

app.get("/", (req, res) => {
  res.send({ title: "Backend de Pasteleros" });
});

const storage = new Storage({
  projectId: process.env.PROJECT_ID,
  keyFilename: process.env.KEYFILENAME,
});

const bucketName = process.env.BUCKET_NAME;

// Configuración de multer para usar Google Cloud Storage directamente
const upload = multer({
  storage: multer.memoryStorage(), // Usar memoria para multer
});

async function uploadFileToGCS(file, bucketName) {
  try {
    const bucket = storage.bucket(bucketName);
    const blob = bucket.file(file.originalname);
    const blobStream = blob.createWriteStream({
      resumable: false,
      gzip: true,
      metadata: {
        contentType: file.mimetype,
      },
    });

    return new Promise((resolve, reject) => {
      blobStream.on('error', (err) => reject(err));
      blobStream.on('finish', () => {
        const publicUrl = `https://storage.googleapis.com/${bucketName}/${file.originalname}`;
        resolve({ message: "File uploaded successfully", fileUrl: publicUrl });
      });
      blobStream.end(file.buffer);
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
}

// Subir imagen
app.post('/upload', upload.array('files'), async (req, res) => {
  try {
    const uploadPromises = req.files.map(file =>
      uploadFileToGCS(file, bucketName)
    );

    const results = await Promise.all(uploadPromises);
    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ error: "Error uploading files" });
  }
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
