const mongoose = require("mongoose");

const pastelSchema = new mongoose.Schema(
  {
    flavor: {
      type: String,
      required: true,
    },
    levels: {
      type: String,
      //required: true,
    },
    portions: {
      type: String,
      //required: true,
    },
    delivery: {
      type: String,
      //required: true,
    },
    stuffedFlavor: {
      type: String,
      //required: true,
    },
    devileryAdress: {
      type: String,
      //required: true,
    },
    devileryDate: {
      type: String,
      //required: true,
    },
    buttercream: {
      type: String,
      //required: true,
    },
    ganache: {
      type: String,
      //required: true,
    },
    fondant: {
      type: String,
      //required: true,
    },
    fondantDraw: {
      type: String,
      //required: true,
    },
    fondant3d: {
      type: String,
      //required: true,
    },
    naturalFlowers: {
      type: String,
      //required: true,
    },
    fondantFlowers: {
      type: String,
      //required: true,
    },
    sign: {
      type: String,
      //required: true,
    },
    character: {
      type: String,
      //required: true,
    },
    other: {
      type: String,
      //required: true,
    },
    budget: {
      type: String,
      ////required: true,
    },
    contactName: {
      type: String,
      //required: true,
    },
    contactPhone: {
      type: String,
      //required: true,
    },
    questionsOrComments: {
      type: String,
      //required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Prices = mongoose.model("pricespasteles", pastelSchema);

module.exports = Prices;
