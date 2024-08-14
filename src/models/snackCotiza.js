const mongoose = require("mongoose");

const snacksSchema = new mongoose.Schema(
  {
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
    pay: {
      type: String,
      //required: true,
    },
    brownie: {
      type: String,
      //required: true,
    },
    coockie: {
      type: String,
      //required: true,
    },
    alfajores: {
      type: String,
      //required: true,
    },
    macaroni: {
      type: String,
      //required: true,
    },
    donuts: {
      type: String,
      //required: true,
    },
    lollipops: {
      type: String,
      //required: true,
    },
    cupcakes: {
      type: String,
      //required: true,
    },
    bread: {
      type: String,
      //required: true,
    },
    tortaOrange: {
      type: String,
      //required: true,
    },
    americanCoockies: {
      type: String,
      //required: true,
    },
    tortaApple: {
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
      match: [/^[0-9]+$/, "character not valid"],
    },
    questionsOrComments: {
      type: String,
      //required: true,
      match: [/^[A-Za-z]+$/, "Character not valid"],
    },
  },
  {
    timestamps: true,
  }
);

const Pricessnacks = mongoose.model("pricessnacks", snacksSchema);

module.exports = Pricessnacks;
