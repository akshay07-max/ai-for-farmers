const Redis = require("ioredis");
const logger = require("../utils/logger");

let redisClient;

async function connectRedis() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    logger.warn("REDIS_URL is not set. Skipping Redis connection in dev.");
    return;
  }

  try {
    redisClient = new Redis(redisUrl);

    redisClient.on("connect", () => {
      logger.info("✅ Redis connected successfully");
    });

    redisClient.on("error", (err) => {
      logger.error("❌ Redis connection error");
      logger.error(err.message || err);
    });
  } catch (err) {
    logger.error("❌ Failed to initialize Redis client");
    logger.error(err.message || err);
  }
}

function getRedisClient() {
  return redisClient;
}

module.exports = {
  connectRedis,
  getRedisClient,
};

