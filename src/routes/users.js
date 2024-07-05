const express = require("express");
const router = express.Router();
const User = require("../models/users");

router.post("/", async (req, res) => {
  try {
    const user = req.body;
    user.password = await User.encryptPassword(user.password);
    const newUser = await User.create(user);
    await newUser.save();
    res.status(201).send({ message: "User created", data: newUser });
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

router.post("/login", async (req, res) => {
  try {
    const user = ({ email, password } = req.body);
    const users = await User.findOne({ email: email });
    if (!user || !(await User.isValidPassword(password, users.password))) {
      res.status(401).send({ message: "Invalid email or password" });
    } else {
      const token = await User.createToken({ _id: user._id, name: user.name });
      res.status(201).send({ message: "Login Success", data: token });
    }
  } catch (error) {
    res.status(400).send({ message: error });
  }
});

module.exports = router;
