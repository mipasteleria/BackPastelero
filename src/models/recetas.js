const mongoose = require("mongoose");

const recetasSchema = new mongoose.Schema(
  {
    recipeName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    butter: {
      type: String,
      required: true,
    },
    refinedSugar: {
      type: String,
      required: true,
    },
    egg: {
      type: String,
      required: true,
    },
    flour: {
      type: String,
      required: true,
    },
    bakingPowder: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Pricessnacks = mongoose.model("pricessnacks", snacksSchema);

module.exports = Pricessnacks;
