require("dotenv").config();
const { Storage } = require("@google-cloud/storage");
const express = require("express");
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

app.get("/", (req, res) => {
  res.send({ title: "Backend de Pasteleros" });
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

<<<<<<< HEAD
app.set('view engine', 'ejs')

app.get('/a',(req,res) => {
  res.render('index.ejs')
})


=======
async function uploadFile(bucketName, file, fileOutputName) {
  try {
    const projectID = process.env.PROJECT_ID;
    const keyFileName = process.env.KEYFILENAME;
    const storage = new Storage({ projectID, keyFileName });

    const bucket = storage.bucket(bucketName);

    const ret = await bucket.upload(file, {
      destination: fileOutputName,
    });
    return ret;
  } catch (error) {
    console.error("Error:", error);
  }
}
(async () => {
  const ret = await uploadFile(
    process.env.BUCKET_NAME,
    "test.txt",
    "Pastelerosdesdefunciob.txt"
  );
  console.log(ret);
})();
>>>>>>> a1e794f6e9d304a7913d46aa2bdcce7439fc6f19
