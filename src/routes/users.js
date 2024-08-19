const express = require("express");
const router = express.Router();
const User = require("../models/users");
const checkRoleToken = require("../middlewares/myRoleToken");

// Registro
router.post("/", async (req, res) => {
  try {
    const user = req.body;

    if (
      !user.name ||
      !user.lastname ||
      !user.email ||
      !user.password ||
      !user.phone
    ) {
      return res
        .status(400)
        .json({ message: "All required fields must be filled" });
    }

    user.password = await User.encryptPassword(user.password);

    const newUser = new User(user);
    await newUser.save();
    res
      .status(201)
      .send({ message: "User created successfully", data: newUser });
  } catch (error) {
    res.status(400).send({
      message: error.message || "An error occurred while creating the user",
      error,
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

// Recuperar listado
router.get("/list", checkRoleToken("admin"), async (req, res) => {
  try {
    const usersData = await User.find();
    res.send({ message: "All users", data: usersData });
  } catch (error) {
    res.status(400).send({
      message: error.message || "An error occurred while retrieving users",
      error,
    });
  }
});

// Ruta para obtener un usuario por ID
router.get("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.status(200).json({ message: "Usuario encontrado", data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener el usuario" });
  }
});

// Ruta para actualizar un usuario
router.put("/:id", checkRoleToken("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const updatedUser = await User.findByIdAndUpdate(id, req.body, {
      new: true,
    });

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
