// ================================================================
// CRON JOB SCHEDULER
// All background jobs are registered and started here.
// Called once from app.js at startup.
//
// Cron syntax: minute hour day month weekday
//   '0 6 * * *'    = every day at 6:00 AM
//   '0 */6 * * *'  = every 6 hours
//   '0 9 * * 1'    = every Monday at 9 AM
// ================================================================
const cron = require("node-cron");
const logger = require("../utils/logger");

// Import individual job functions
const { syncMarketPrices } = require("./marketSyncJob");
const { checkSubscriptionExpiry } = require("./subscriptionExpiryJob");

/**
 * Start all cron jobs.
 * Called from app.js after DB + Redis are connected.
 */
const startCronJobs = () => {
  if (process.env.ENABLE_CRON_JOBS !== "true") {
    logger.warn(
      "⚠️  Cron jobs disabled. Set ENABLE_CRON_JOBS=true in .env to enable.",
    );
    return;
  }

  logger.info("⏰ Starting cron jobs...");

  // ── Market price sync ─────────────────────────────────────
  // Runs every day at 8:00 AM — after mandis open and report prices
  cron.schedule(
    "0 8 * * *",
    async () => {
      logger.info("[CRON] Market price sync started");
      await syncMarketPrices();
    },
    { timezone: "Asia/Kolkata" },
  );

  // ── Subscription expiry check ─────────────────────────────
  // Runs every day at 9:00 AM — warns farmers before plan expires
  cron.schedule(
    "0 9 * * *",
    async () => {
      logger.info("[CRON] Subscription expiry check started");
      await checkSubscriptionExpiry();
    },
    { timezone: "Asia/Kolkata" },
  );

  logger.info("✅ Cron jobs scheduled");
  logger.info("   • Market price sync:    daily 8:00 AM IST");
  logger.info("   • Subscription expiry:  daily 9:00 AM IST");
};

module.exports = { startCronJobs };
