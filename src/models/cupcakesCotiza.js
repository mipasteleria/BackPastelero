const mongoose = require("mongoose");

const cupcakesSchema = new mongoose.Schema(
  {
    flavorBizcocho: {
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
    other: {
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
