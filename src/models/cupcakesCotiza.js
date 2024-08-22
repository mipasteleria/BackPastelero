const mongoose = require("mongoose");

const cupcakesSchema = new mongoose.Schema(
  {
    flavorBizcocho: {
      type: String,
      //required: true,
    },
    stuffedFlavor: {
      type: String,
      //required: true,
    },
    cover: {
      type: String,
      //required: true,
    },
    portions: {
      type: String,
      //required: true,
    },
    fondantCover: {
      type: String,
      //required: true,
    },
    delivery: {
      type: String,
      //required: true,
    },
    deliveryAdress: {
      type: String,
      //required: true,
    },
    deliveryDate: {
      type: String,
      //required: true,
    },
    fondantDraw: {
      type: String,
      //required: true,
    },
    buttercreamDraw: {
      type: String,
      //required: true,
    },
    naturalFlowers: {
      type: String,
      //required: true,
    },
    sign: {
      type: String,
      //required: true,
    },
    eatablePrint: {
      type: String,
      //required: true,
    },
    sprinkles: {
      type: String,
      //required: true,
    },
    other: {
      type: String,
      //required: true,
    },
    image: {
      type: String,
      //required: true,
    },
    budget: {
      type: String,
      //required: true,
      match: [/^[0-9]+$/, "character not valid"],
    },
    contactName: {
      type: String,
      //required: true,
      match: [/^[A-Za-z]+$/, "Character not valid"],
    },
    contactPhone: {
      type: String,
      //required: true,
      match: [/^[0-9]+$/, "Character not valid"],
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

const Pricescupcakes = mongoose.model("pricescupcakes", cupcakesSchema);

module.exports = Pricescupcakes;
