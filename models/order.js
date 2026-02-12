const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  userId: String,
  username: String,
  item: String,
  quantity: Number,
  price: Number,
  payment: String,
  status: {
    type: String,
    default: "noted"
  },
  messageId: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Order", orderSchema);