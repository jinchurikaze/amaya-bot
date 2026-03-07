const mongoose = require("mongoose");

console.log("🔍 MONGO_URI:", process.env.MONGO_URI); // temp debug line

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  });

module.exports = mongoose;