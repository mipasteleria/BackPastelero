const mongoose = require("mongoose");
const costeoSnapshotSchema = require("./costeoSnapshot");

const cupcakesSchema = new mongoose.Schema(
  {
    priceType: {
      type: String,
      default: "Cupcake",
    },
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
    budget: {
      type: String,
      match: [/^[0-9]+$/, "character not valid"],
    },
    contactName: {
      type: String,
      required: true,
    },
    contactPhone: {
      type: String,
      required: true,
      // Normaliza a solo dígitos (acepta formato viejo con guiones y +52).
      set: (v) => String(v || "").replace(/\D/g, "").replace(/^52(?=\d{10}$)/, ""),
      match: [/^\d{10}$/, "El teléfono debe tener 10 dígitos"],
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
    // ID del evento de Google Calendar (mismo patrón que pastelCotiza).
    calendarEventId: {
      type: String,
      default: "",
    },
    notasInternas: {
      type: [require("./notaInternaSchema")],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const Pricescupcakes = mongoose.model("pricescupcakes", cupcakesSchema);

module.exports = Pricescupcakes;
