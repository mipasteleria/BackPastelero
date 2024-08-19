const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const roles = ["user", "admin"];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      match: [/^[A-Za-zÀ-ÿ]+$/, "Character not valid"], // Permitir caracteres especiales
    },
    lastname: {
      type: String,
      required: true,
      trim: true,
      match: [/^[A-Za-zÀ-ÿ\s]+$/, "Character not valid"], // Permitir caracteres especiales
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, "Email not valid"],
    },
    password: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
      match: [/^[0-9]+$/, "Phone number not valid"],
    },
    role: {
      type: String,
      enum: roles,
      default: "user",
    },
  },
  {
    timestamps: true,
    statics: {
      encryptPassword: async function (password) {
        const salt = await bcrypt.genSalt(15);
        return await bcrypt.hash(password, salt);
      },
      isValidPassword: async function (password, hash) {
        return await bcrypt.compare(password, hash);
      },
      createToken: async function (payload) {
        return jwt.sign(payload, process.env.JWT_SIGN, { expiresIn: "1h" });
      },
    },
  }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
