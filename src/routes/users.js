const express = require("express");
const router = express.Router();
const User = require("../models/users");
const checkRoleToken = require("../middlewares/myRoleToken");

// Registro (endpoint público)
// IMPORTANTE: solo tomamos los campos permitidos del body. NUNCA aceptamos
// `role` del cliente (sería escalada de privilegios). El rol siempre es "user".
router.post("/", async (req, res) => {
  try {
    const { name, lastname, email, password, phone } = req.body || {};

    if (!name || !lastname || !email || !password || !phone) {
      return res
        .status(400)
        .json({ message: "All required fields must be filled" });
    }

    const hashed = await User.encryptPassword(password);
    const newUser = new User({
      name,
      lastname,
      email,
      password: hashed,
      phone,
      role: "user",
    });
    await newUser.save();

    const { password: _ignored, ...safeUser } = newUser.toObject();
    res
      .status(201)
      .send({ message: "User created successfully", data: safeUser });
  } catch (error) {
    res.status(400).send({
      message: error.message || "An error occurred while creating the user",
    });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email });

    if (!user || !(await User.isValidPassword(password, user.password))) {
      return res.status(401).send({ message: "Invalid email or password" });
    }

    const token = await User.createToken({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    });
    res.status(200).send({ message: "Login Success", token: token });
  } catch (error) {
    res.status(400).send({
      message: error.message || "An error occurred during login",
      error,
    });
  }
});

// Recuperar listado (sin exponer hashes de password)
router.get("/list", checkRoleToken("admin"), async (req, res) => {
  try {
    const usersData = await User.find().select("-password");
    res.send({ message: "All users", data: usersData });
  } catch (error) {
    res.status(400).send({
      message: error.message || "An error occurred while retrieving users",
      error,
    });
  }
});

// Ruta para obtener un usuario por ID (sin password)
router.get("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.status(200).json({ message: "Usuario encontrado", data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener el usuario" });
  }
});

// Ruta para actualizar un usuario — solo admin
// Si viene `password` lo hasheamos antes de guardar. Nunca devolvemos el hash.
router.put("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const payload = { ...req.body };

    if (payload.password) {
      payload.password = await User.encryptPassword(payload.password);
    }

    const updatedUser = await User.findByIdAndUpdate(id, payload, {
      new: true,
    }).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res
      .status(200)
      .json({ message: "Usuario actualizado con éxito", data: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al actualizar el usuario" });
  }
});

// Ruta para eliminar un usuario
router.delete("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res
        .status(400)
        .json({ message: "ID de usuario no proporcionado" });
    }

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.status(200).json({ message: "Usuario eliminado con éxito" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al eliminar el usuario" });
  }
});

module.exports = router;
