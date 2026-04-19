const mongoose = require("mongoose");

if (!process.env.MONGO_URL) {
  throw new Error("MONGO_URL no está definida en el entorno (.env)");
}

const connect = mongoose
  .connect(process.env.MONGO_URL)
  .then(() => "Success connection to DB")
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
  });

module.exports = {
  connect,
};
