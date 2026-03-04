const mongoose = require("mongoose");
const logger = require("../utils/logger");

async function connectDB() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!uri) {
    logger.error("MONGODB_URI is not set. Skipping DB connection in dev.");
    return;
  }

  try {
    await mongoose.connect(uri);
    logger.info("✅ MongoDB connected successfully");
  } catch (err) {
    logger.error("❌ Failed to connect to MongoDB");
    logger.error(err.message || err);
    // In production you might want to exit; for now just throw
    throw err;
  }
}

module.exports = connectDB;

