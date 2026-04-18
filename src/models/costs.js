const mongoose = require("mongoose");

const costSchema = new mongoose.Schema({
  fixedCosts: {
    type: Number,
    required: true,
  },
  laborCosts: {
    type: Number,
    required: true,
  },
});

module.exports = mongoose.model("Cost", costSchema);
