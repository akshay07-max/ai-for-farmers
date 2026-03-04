const Redis = require("ioredis");
const logger = require("../utils/logger");

let redisClient;

// ── Connect to Redis ─────────────────────────────────────────────────────────
async function connectRedis() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    logger.warn("⚠️  REDIS_URL is not set. Skipping Redis connection.");
    logger.warn("   OTP and token-blacklist features will not work.");
    return;
  }

  try {
    redisClient = new Redis(redisUrl);

    redisClient.on("connect", () => {
      logger.info("✅ Redis connected successfully");
    });

    redisClient.on("error", (err) => {
      logger.error("❌ Redis connection error: " + err.message);
    });
  } catch (err) {
    logger.error("❌ Failed to initialize Redis client: " + err.message);
  }
}

// ── Get raw client (used if you need direct ioredis access) ──────────────────
function getRedisClient() {
  return redisClient;
}

// ── Safe helper wrappers ─────────────────────────────────────────────────────
// These are what auth.service.js (and future services) import as { redis }.
// They gracefully return false/null if Redis is not connected,
// so the app never crashes just because Redis is down.

const redis = {
  /**
   * Store a value with auto-expiry
   * @param {string} key           - e.g. "otp:register:9876543210"
   * @param {any}    value         - any value (gets JSON.stringified)
   * @param {number} expirySeconds - auto-deletes after this many seconds
   */
  set: async (key, value, expirySeconds) => {
    if (!redisClient) return false;
    try {
      // setex = SET with EXpiry
      await redisClient.setex(key, expirySeconds, JSON.stringify(value));
      return true;
    } catch (err) {
      logger.warn(`Redis SET failed [${key}]: ${err.message}`);
      return false;
    }
  },

  /**
   * Get a stored value (auto JSON-parsed)
   * @returns {any|null}  parsed value, or null if key not found / Redis down
   */
  get: async (key) => {
    if (!redisClient) return null;
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      logger.warn(`Redis GET failed [${key}]: ${err.message}`);
      return null;
    }
  },

  /**
   * Delete a key (e.g. after OTP is used — so it can't be reused)
   */
  del: async (key) => {
    if (!redisClient) return false;
    try {
      await redisClient.del(key);
      return true;
    } catch (err) {
      logger.warn(`Redis DEL failed [${key}]: ${err.message}`);
      return false;
    }
  },

  /**
   * Check if a key exists — returns true or false
   */
  exists: async (key) => {
    if (!redisClient) return false;
    try {
      return (await redisClient.exists(key)) === 1;
    } catch (err) {
      return false;
    }
  },
};

module.exports = { connectRedis, getRedisClient, redis };