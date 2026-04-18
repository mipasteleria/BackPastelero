const mongoose = require("mongoose");

const insumosSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      match: [/^[A-Za-z]+$/, "Character not valid"],
    },
    amount: {
      type: Number,
      required: true,
      match: [/^[0-9]+$/, "character not valid"],
    },
    cost: {
      type: Number,
      required: true,
      match: [/^[0-9]+$/, "character not valid"],
    },
    unit: {
      type: String,
      required: true,
      match: [/^[A-Za-z]+$/, "Character not valid"],
    },
  },
  {
    timestamps: true,
  }
);

const Insumos = mongoose.model("insumos", insumosSchema);

module.exports = Insumos;
