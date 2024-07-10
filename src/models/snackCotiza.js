const mongoose = require("mongoose");

const snacksSchema = new mongoose.Schema(
  {
    portions: {
      type: String,
      required: true,
    },
    delivery: {
      type: String,
      required: true,
    },
    devileryAdress: {
      type: String,
      required: true,
    },
    devileryDate: {
      type: String,
      required: true,
    },
    pay: {
      type: String,
      required: true,
    },
    brownie: {
      type: String,
      required: true,
    },
    coockie: {
      type: String,
      required: true,
    },
    alfajores: {
      type: String,
      required: true,
    },
    macaroni: {
      type: String,
      required: true,
    },
    donuts: {
      type: String,
      required: true,
    },
    lollipops: {
      type: String,
      required: true,
    },
    cupcakes: {
      type: String,
      required: true,
    },
    bread: {
      type: String,
      required: true,
    },
    tortaOrange: {
      type: String,
      required: true,
    },
    americanCoockies: {
      type: String,
      required: true,
    },
    tortaApple: {
      type: String,
      required: true,
    },
    budget: {
      type: String,
      required: true,
    },
    contactName: {
      type: String,
      required: true,
    },
    contactPhone: {
      type: String,
      required: true,
    },
    questionsOrComments: {
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
