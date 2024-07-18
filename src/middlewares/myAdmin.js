const express = require("express");
const router = express.Router();

const myAdmin = (req, res, next) => {
  const { user, role } = req.headers;

  if (user != req.params.id && role != true) {
    res.status(401).send({ message: "User not authorized" });
  } else {
    next();
  }
};
