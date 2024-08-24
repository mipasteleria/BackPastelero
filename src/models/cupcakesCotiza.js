const mongoose = require("mongoose");

const cupcakesSchema = new mongoose.Schema(
  {
    flavorBizcocho: {
      type: String,
      required: true,
    },
    stuffedFlavor: {
      type: String,
      required: true,
    },
    cover: {
      type: String,
      required: true,
    },
    portions: {
      type: String,
      required: true,
    },
    fondantCover: {
      type: String,
    },
    delivery: {
      type: String,
    },
    deliveryAdress: {
      type: String,
    },
    deliveryDate: {
      type: String,
    },
    fondantDraw: {
      type: String,
    },
    buttercreamDraw: {
      type: String,
    },
    naturalFlowers: {
      type: String,
    },
    sign: {
      type: String,
    },
    eatablePrint: {
      type: String,
    },
    sprinkles: {
      type: String,
    },
    other: {
      type: String,
    },
    image: {
      type: String,
    },
    budget: {
      type: String,
      match: [/^[0-9]+$/, "character not valid"],
    },
    contactName: {
      type: String,
      required: true,
      match: [/^[A-Za-z]+$/, "Character not valid"],
    },
    contactPhone: {
      type: String,
      required: true,
      match: [
        /^\d{3}-\d{3}-\d{4}$/,
        "Invalid phone number format. Use 000-000-0000",
      ],
    },
    questionsOrComments: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const Pricescupcakes = mongoose.model("pricescupcakes", cupcakesSchema);

module.exports = Pricescupcakes;
