// ================================================================
// RAZORPAY CLIENT — Payment gateway
// ================================================================
const Razorpay = require("razorpay");
const logger = require("../utils/logger");

let razorpayClient = null;

/**
 * Initialize Razorpay client.
 * Called once from app.js at startup.
 */
const initRazorpay = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    logger.warn(
      "⚠️  Razorpay credentials not set — payment features disabled.",
    );
    return;
  }

  try {
    razorpayClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
    logger.info("✅ Razorpay initialized");
  } catch (err) {
    logger.error(`❌ Razorpay init failed: ${err.message}`);
  }
};

const getRazorpayClient = () => razorpayClient;

module.exports = { initRazorpay, getRazorpayClient };
