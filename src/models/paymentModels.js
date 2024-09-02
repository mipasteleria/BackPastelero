const mongoose = require("mongoose");

const PaymentData = new mongoose.Schema(
  {

    Items: {
      type: Number,
    },
    amount: {
      type: Number,
    },
    status: {
      type: String,
      default: "No aprobado",
    },
    userId: {
      type: String,
      },
    quantity:{
      type: Number,
    },
    email:{
      type: String,
    },
    name:{
      type:String,
    }
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model("PaymentData", PaymentData);

module.exports = Payment;

