const express = require("express");
require("dotenv").config();
const { Storage } = require("@google-cloud/storage");
const path = require("path");
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

const keyFilename = process.env.KEYFILENAME;
const projectID = process.env.PROJECT_ID;
const upload = multer({ dest: "uploads/" });
const storage = new Storage({ projectID, keyFilename });

// Configuración de multer para guardar archivos temporalmente
const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // Carpeta donde se guardarán los archivos temporalmente
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); // Nombre del archivo
  },
});

const uploadMulter = multer({ diskStorage: diskStorage });

async function uploadFile(bucketName, filePath, fileOutputName) {
  try {
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileOutputName);

    await bucket.upload(filePath, {
      destination: file,
    });

    return {
      message: "File uploaded successfully",
      fileUrl: `https://storage.googleapis.com/${bucketName}/${fileOutputName}`,
    };
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
}

//subir imagen
app.post("/upload", upload.array("files"), async (req, res) => {
  try {
    const bucketName = process.env.BUCKET_NAME;

    // Procesar cada archivo cargado
    const uploadPromises = req.files.map((file) => {
      const filePath = file.path;
      const fileOutputName = file.originalname;
      return uploadFile(bucketName, filePath, fileOutputName);
    });

    await Promise.all(uploadPromises);

    res.status(200).json({ message: "Files uploaded successfully" });
  } catch (error) {
    res.status(500).json({ error: "Error uploading files" });
  }
});

//ver imagen
app.get("/image-url/:filename", async (req, res) => {
  console.log("entro al backend imagen");
  try {
    const bucketName = process.env.BUCKET_NAME;
    const fileName = req.params.filename;

    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
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
