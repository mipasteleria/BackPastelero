require("dotenv").config();
const express = require("express");
const app = express();
const port = 3001;
const mongoDB = require("./src/database/db.js");
const usersRoutes = require("./src/routes/users");

const cors = require("cors");
const corsOptions = {
  origin: "*",
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));

app.use(express.json());

app.use("/users", usersRoutes);

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
