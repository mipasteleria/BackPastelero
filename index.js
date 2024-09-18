const express = require("express");
const app = express();
require("dotenv").config();
const { Storage } = require("@google-cloud/storage");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const port = 3001;
const mongoDB = require("./src/database/db.js");
const usersRoutes = require("./src/routes/users.js");
const pricesCakeRoutes = require("./src/routes/pastelCotiza.js");
const pricesCupcakesRoutes = require("./src/routes/cupcakesCotiza.js");
const pricesSnackRoutes = require("./src/routes/snackCotiza.js");
const insumosRoutes = require("./src/routes/insumos.js");
const recetasRoutes = require("./src/routes/recetas");
const ingredientesRoutes = require("./src/routes/recetas/ingredientes");
const costsRoutes = require("./src/routes/costs.js");
const createCheckoutSession = require("./src/routes/create-payment-intent/server.js");

const cors = require("cors");

const corsOptions = {
  origin: "*",
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/users", usersRoutes);
app.use("/pricecake", pricesCakeRoutes);
app.use("/pricecupcake", pricesCupcakesRoutes);
app.use("/pricesnack", pricesSnackRoutes);
app.use("/insumos", insumosRoutes);
app.use("/recetas", recetasRoutes);
app.use("/recetas/ingredientes", ingredientesRoutes);
app.use("/checkout", createCheckoutSession);
app.use("/costs", costsRoutes);

const storage = new Storage({
  projectId: process.env.GCLOUD_PROJECT_ID,
  keyFilename: process.env.GCLOUD_KEY_FILE,
});
const bucket = storage.bucket(process.env.GCLOUD_BUCKET_NAME);
const upload = multer({
  storage: multer.memoryStorage(),
});

app.post(
  "/upload",
  upload.fields([
    { name: "file1", maxCount: 1 },
    { name: "file2", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files;

      if (!files || (files.file1 === undefined && files.file2 === undefined)) {
        return res.status(400).json({ error: "No files uploaded." });
      }

      const uploadPromises = [];

      if (files.file1) {
        const file1 = files.file1[0];
        const blob1 = bucket.file(`${uuidv4()}-${file1.originalname}`);
        const blobStream1 = blob1.createWriteStream({
          resumable: false,
          contentType: file1.mimetype,
        });

        const uploadPromise1 = new Promise((resolve, reject) => {
          blobStream1.on("error", (err) => reject(err));
          blobStream1.on("finish", () => {
            resolve(
              `https://storage.googleapis.com/${bucket.name}/${blob1.name}`
            );
          });
          blobStream1.end(file1.buffer);
        });
        uploadPromises.push(uploadPromise1);
      }

      if (files.file2) {
        const file2 = files.file2[0];
        const blob2 = bucket.file(`${uuidv4()}-${file2.originalname}`);
        const blobStream2 = blob2.createWriteStream({
          resumable: false,
          contentType: file2.mimetype,
        });

        const uploadPromise2 = new Promise((resolve, reject) => {
          blobStream2.on("error", (err) => reject(err));
          blobStream2.on("finish", () => {
            resolve(
              `https://storage.googleapis.com/${bucket.name}/${blob2.name}`
            );
          });

          blobStream2.end(file2.buffer);
        });
        uploadPromises.push(uploadPromise2);
      }

      const uploadedFiles = await Promise.all(uploadPromises);

      res.status(200).json({ files: uploadedFiles });
      console.log(uploadedFiles);
    } catch (error) {
      console.error("Upload failed:", error);
      res.status(500).json({ error: `Upload failed: ${error.message}` });
    }
  }
);

mongoDB.connect
  .then((message) => {
    console.log(message);
    app.listen(port, () => {
      console.log("Server is listening on port", port);
    });
  })
  .catch((error) => {
    console.log(error);
  });