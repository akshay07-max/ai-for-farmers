// ================================================================
// TWILIO CLIENT — Real SMS sending
// ================================================================
const twilio = require("twilio");
const logger = require("../utils/logger");

let twilioClient = null;

/**
 * Initialize Twilio client.
 * Called once from app.js at startup.
 * If credentials are missing, logs a warning and SMS will be skipped.
 */
const initTwilio = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    logger.warn(
      "⚠️  Twilio credentials not set — SMS will print to terminal only.",
    );
    return;
  }

  try {
    twilioClient = twilio(accountSid, authToken);
    logger.info("✅ Twilio initialized");
  } catch (err) {
    logger.error(`❌ Twilio init failed: ${err.message}`);
  }
};

/**
 * Send a real SMS message.
 *
 * @param {string} to      — Recipient phone in E.164 format: "+919876543210"
 * @param {string} body    — The SMS text
 * @returns {boolean}      — true if sent, false if failed
 */
const sendSMS = async (to, body) => {
  // DEV: always print to terminal so you can see OTPs without real SMS credits
  if (process.env.NODE_ENV !== "production") {
    logger.info("──────────────────────────────────────────");
    logger.info(`  📱 SMS to ${to}`);
    logger.info(`  💬 "${body}"`);
    logger.info("  (DEV MODE — also sending real SMS if Twilio is configured)");
    logger.info("──────────────────────────────────────────");
  }

  // If Twilio is not initialized (missing credentials), stop here
  if (!twilioClient) {
    logger.warn("Twilio not initialized. SMS not sent.");
    return false;
  }

  try {
    const message = await twilioClient.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    logger.info(`✅ SMS sent to ${to} | SID: ${message.sid}`);
    return true;
  } catch (err) {
    // Common errors:
    // 21608 — unverified number (trial account only allows verified numbers)
    // 21211 — invalid phone number format
    logger.error(`❌ SMS failed to ${to}: [${err.code}] ${err.message}`);
    return false;
  }
};

module.exports = { initTwilio, sendSMS };
