// ================================================================
// MARKET SYNC JOB
// Runs daily at 8 AM. Fetches latest prices from Agmarknet for
// all major crops and markets, stores in MongoDB, then checks
// if any price changed >10% and sends alerts to affected farmers.
// ================================================================
const axios = require("axios");
const MarketPrice = require("../models/MarketPrice");
const User = require("../models/User");
const notificationService = require("../services/notificationService");
const logger = require("../utils/logger");

// Major crop+market combinations to sync every day
// Add more as needed — these are the most popular in Maharashtra
const SYNC_TARGETS = [
  { crop: "onion", market: "Lasalgaon", district: "Nashik" },
  { crop: "onion", market: "Pune", district: "Pune" },
  { crop: "tomato", market: "Pune", district: "Pune" },
  { crop: "tomato", market: "Mumbai", district: "Mumbai" },
  { crop: "potato", market: "Pune", district: "Pune" },
  { crop: "soybean", market: "Latur", district: "Latur" },
  { crop: "cotton", market: "Akola", district: "Akola" },
  { crop: "wheat", market: "Nagpur", district: "Nagpur" },
  { crop: "grapes", market: "Nashik", district: "Nashik" },
  { crop: "sugarcane", market: "Kolhapur", district: "Kolhapur" },
];

const syncMarketPrices = async () => {
  let synced = 0;
  let failed = 0;
  const priceChanges = []; // collect significant changes for alerts

  const apiKey = process.env.AGMARKNET_API_KEY;
  if (!apiKey) {
    logger.warn("[MarketSync] AGMARKNET_API_KEY not set — skipping live sync.");
    return;
  }

  for (const target of SYNC_TARGETS) {
    try {
      const response = await axios.get(
        "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070",
        {
          params: {
            "api-key": apiKey,
            format: "json",
            limit: 3,
            "filters[commodity]": target.crop,
            "filters[market]": target.market,
          },
          timeout: 10000,
        },
      );

      const records = response.data?.records;
      if (!records?.length) continue;

      const latest = records[0];
      const newPrice = parseFloat(latest.modal_price) || 0;
      if (!newPrice) continue;

      // Get yesterday's price to detect significant changes
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const previousRecord = await MarketPrice.findOne(
        { crop: target.crop, market: target.market },
        { price: 1 },
        { sort: { tradeDate: -1 } },
      );

      // Upsert today's price
      await MarketPrice.findOneAndUpdate(
        {
          crop: target.crop,
          market: target.market,
          tradeDate: new Date(latest.arrival_date),
        },
        {
          $set: {
            price: newPrice,
            minPrice: parseFloat(latest.min_price) || newPrice,
            maxPrice: parseFloat(latest.max_price) || newPrice,
            arrivalQuantity: parseFloat(latest.arrivals_in_qtl) || 0,
            district: target.district,
            state: "Maharashtra",
            dataSource: "Agmarknet",
          },
        },
        { upsert: true },
      );

      synced++;
      logger.info(
        `[MarketSync] ${target.crop} @ ${target.market}: ₹${newPrice}/qtl`,
      );

      // Check for significant price change (>10%)
      if (previousRecord?.price) {
        const changePct =
          ((newPrice - previousRecord.price) / previousRecord.price) * 100;
        if (Math.abs(changePct) >= 10) {
          priceChanges.push({
            crop: target.crop,
            market: target.market,
            newPrice,
            changePct: parseFloat(changePct.toFixed(1)),
            direction: changePct > 0 ? "RISE" : "DROP",
          });
        }
      }
    } catch (err) {
      failed++;
      logger.error(
        `[MarketSync] Failed ${target.crop}@${target.market}: ${err.message}`,
      );
    }

    // Small delay between API calls to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  // ── Send price alerts to affected farmers ─────────────────
  if (priceChanges.length > 0) {
    await sendPriceAlerts(priceChanges);
  }

  logger.info(
    `[MarketSync] Complete: ${synced} synced, ${failed} failed, ${priceChanges.length} alerts sent`,
  );
};

const sendPriceAlerts = async (priceChanges) => {
  for (const change of priceChanges) {
    // Find all farmers who grow this crop
    const farmers = await User.find({
      primaryCrops: change.crop,
      isVerified: true,
      isActive: true,
    }).select("_id");

    for (const farmer of farmers) {
      if (change.direction === "DROP") {
        await notificationService.sendPriceDropAlert(
          farmer._id,
          change.crop,
          change.market,
          change.newPrice,
          Math.abs(change.changePct),
        );
      } else {
        await notificationService.sendPriceRiseAlert(
          farmer._id,
          change.crop,
          change.market,
          change.newPrice,
          change.changePct,
        );
      }
    }

    logger.info(
      `[MarketSync] Alerts sent for ${change.crop}: ${change.direction} ${change.changePct}% to ${farmers.length} farmers`,
    );
  }
};

module.exports = { syncMarketPrices };
