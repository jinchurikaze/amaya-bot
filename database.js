const mongoose = require("mongoose");

const uri = process.env.MONGO_URI || "mongodb+srv://kazeda:XM6lh9gqCKOa3Hr0@amaya.xh24aec.mongodb.net/amaya-bot?appName=AMAYA";

console.log("🔍 Using URI:", uri ? "URI found" : "No URI");

mongoose.connect(uri)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  });

module.exports = mongoose;