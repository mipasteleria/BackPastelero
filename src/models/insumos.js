const mongoose = require("mongoose");

const insumosSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      //required: true,
    },
    cost: {
      type: Number,
      //required: true,
    },
    unit: {
      type: String,
      //required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Insumos = mongoose.model("insumos", insumosSchema);

module.exports = Insumos;
