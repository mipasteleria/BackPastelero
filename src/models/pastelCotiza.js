const mongoose = require("mongoose");

const pastelSchema = new mongoose.Schema(
  {
    priceType: {
      type: String,
      default: "Pastel",
    },
    flavor: {
      type: String,
      required: true,
    },
    levels: {
      type: String,
      required: true,
    },
    portions: {
      type: String,
      required: true,
    },
    delivery: {
      type: String,
    },
    stuffedFlavor: {
      type: String,
    },
    cover: {
      type: String,
    },
    deliveryAdress: {
      type: String,
    },
    fondantCover: {
      type: String,
    },
    deliveryDate: {
      type: String,
    },
    buttercream: {
      type: String,
    },
    ganache: {
      type: String,
    },
    fondant: {
      type: String,
    },
    fondantDraw: {
      type: String,
    },
    buttercreamDraw: {
      type: String,
    },
    sugarcharacter3d: {
      type: String,
    },
    naturalFlowers: {
      type: String,
    },
    fondantFlowers: {
      type: String,
    },
    sign: {
      type: String,
    },
    eatablePrint: {
      type: String,
    },
    character: {
      type: String,
    },
    other: {
      type: String,
    },
    budget: {
      type: Number,
      match: [/^[0-9]+$/, "character not valid"],
    },
    contactName: {
      type: String,
      required: true,
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
    precio: {
      type: Number,
    },
    anticipo: {
      type: Number,
    },
    status: {
      type: String,
      default: "Pendiente",
    },
    userId: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const Prices = mongoose.model("pricespasteles", pastelSchema);

module.exports = Prices;
