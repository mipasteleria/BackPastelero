const mongoose = require("mongoose");

const snacksSchema = new mongoose.Schema(
  {
    people: {
      type: String,
      required: true,
    },
    portionsPerPerson: {
      type: String,
      required: true,
    },
    delivery: {
      type: String,
    },
    deliveryAdress: {
      type: String,
    },
    deliveryDate: {
      type: String,
      required: true,
    },
    pay: {
      type: String,
    },
    brownie: {
      type: String,
    },
    coockie: {
      type: String,
    },
    alfajores: {
      type: String,
    },
    macaroni: {
      type: String,
    },
    donuts: {
      type: String,
    },
    lollipops: {
      type: String,
    },
    cupcakes: {
      type: String,
    },
    bread: {
      type: String,
    },
    tortaFruts: {
      type: String,
    },
    americanCoockies: {
      type: String,
    },
    tortaApple: {
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

const Pricessnacks = mongoose.model("pricessnacks", snacksSchema);

module.exports = Pricessnacks;
