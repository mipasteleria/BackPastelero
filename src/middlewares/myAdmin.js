const express = require("express");

const myAdmin = (req, res, next) => {
  console.log("Hola");
  next();
};

module.exports = {
  myAdmin,
};
