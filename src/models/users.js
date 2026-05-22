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
      match: [
        /^\d{3}-\d{3}-\d{4}$/,
        "Phone number not valid. Must be in the format 000-000-0000",
      ],
    },
    resetPasswordToken: {
      type: String,
      default: undefined,
    },
    resetPasswordExpires: {
      type: Date,
      default: undefined,
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
      // bcrypt rounds:
      //   12 = ~250 ms por hash en hardware típico → cómodo en serverless
      //   15 = ~3 s (exagerado, causaba 504 en cold-starts de Vercel)
      // OWASP 2025 recomienda 10-12 para bcrypt; 12 da margen amplio.
      // Hashes generados antes con rounds=15 siguen funcionando: bcrypt.compare
      // detecta los rounds del hash automáticamente.
      BCRYPT_ROUNDS: 12,

      encryptPassword: async function (password) {
        const salt = await bcrypt.genSalt(this.BCRYPT_ROUNDS);
        return await bcrypt.hash(password, salt);
      },
      isValidPassword: async function (password, hash) {
        return await bcrypt.compare(password, hash);
      },
      // Permite saber cuántos rounds tiene un hash existente.
      // Útil para "rehash on next login" si bajamos rounds globalmente.
      getRoundsFromHash: function (hash) {
        try {
          return bcrypt.getRounds(hash);
        } catch {
          return null;
        }
      },
      createToken: async function (payload) {
        return jwt.sign(payload, process.env.JWT_SIGN, { expiresIn: "1h" });
      },
    },
  }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
