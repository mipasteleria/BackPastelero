const mongoose = require("mongoose");
const costeoSnapshotSchema = require("./costeoSnapshot");
const notaInternaSchema = require("./notaInternaSchema");

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
    saldoPendiente: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      default: "Pendiente",
    },
    reminderSentAt: {
      type: Date,
    },
    userId: {
      type: String,
    },
    images: [{ type: String }],
    costeoSnapshot: {
      type: costeoSnapshotSchema,
      default: null,
    },
    // ID del evento creado en Google Calendar cuando la cotización pasa a
    // estado "Agendado...". Se usa para borrar el evento si después se
    // cancela. Empty string = sin evento (más friendly que null para
    // comparaciones en el código).
    calendarEventId: {
      type: String,
      default: "",
    },
    // Notas internas de admin (append-only desde UI). Ver
    // src/models/notaInternaSchema.js. NO se expone al cliente final.
    notasInternas: {
      type: [notaInternaSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const Prices = mongoose.model("pricespasteles", pastelSchema);

module.exports = Prices;
