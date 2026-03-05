// ================================================================
// MARKET SERVICE — All market price business logic
// ================================================================
const axios = require("axios");
const MarketPrice = require("../../models/MarketPrice");
const { redis } = require("../../config/redis");
const { AppError } = require("../../middlewares/errorHandler");
const logger = require("../../utils/logger");

// ── Crop metadata ────────────────────────────────────────────────────────────
// Master list of supported crops with multilingual names.
// This is the source of truth — add new crops here as needed.
const CROP_CATALOGUE = [
  { id: "onion", nameEn: "Onion", nameMr: "कांदा", nameHi: "प्याज" },
  { id: "tomato", nameEn: "Tomato", nameMr: "टोमॅटो", nameHi: "टमाटर" },
  { id: "potato", nameEn: "Potato", nameMr: "बटाटा", nameHi: "आलू" },
  { id: "wheat", nameEn: "Wheat", nameMr: "गहू", nameHi: "गेहूँ" },
  { id: "rice", nameEn: "Rice", nameMr: "तांदूळ", nameHi: "चावल" },
  { id: "soybean", nameEn: "Soybean", nameMr: "सोयाबीन", nameHi: "सोयाबीन" },
  { id: "cotton", nameEn: "Cotton", nameMr: "कापूस", nameHi: "कपास" },
  { id: "sugarcane", nameEn: "Sugarcane", nameMr: "ऊस", nameHi: "गन्ना" },
  { id: "maize", nameEn: "Maize", nameMr: "मका", nameHi: "मक्का" },
  { id: "garlic", nameEn: "Garlic", nameMr: "लसूण", nameHi: "लहसुन" },
  { id: "ginger", nameEn: "Ginger", nameMr: "आले", nameHi: "अदरक" },
  { id: "grapes", nameEn: "Grapes", nameMr: "द्राक्षे", nameHi: "अंगूर" },
  { id: "banana", nameEn: "Banana", nameMr: "केळी", nameHi: "केला" },
  {
    id: "pomegranate",
    nameEn: "Pomegranate",
    nameMr: "डाळिंब",
    nameHi: "अनार",
  },
  { id: "turmeric", nameEn: "Turmeric", nameMr: "हळद", nameHi: "हल्दी" },
];

// ── Cache TTL constants ───────────────────────────────────────────────────────
const CACHE_TTL_LIVE_PRICE = 30 * 60; // 30 minutes (prices change per mandi session)
const CACHE_TTL_PREDICTION = 6 * 60 * 60; // 6 hours (predictions don't change often)
const CACHE_TTL_HISTORY = 60 * 60; // 1 hour

// ── Agmarknet API helper ──────────────────────────────────────────────────────
/**
 * Fetch live price from Agmarknet (Indian government mandi data API).
 *
 * API docs: https://agmarknet.gov.in
 * The API key is free — register at agmarknet.gov.in to get one.
 *
 * We use a fallback strategy:
 * 1. Try live Agmarknet API
 * 2. If that fails, check MongoDB for the most recent stored price
 * 3. If that also fails, return a clear error
 */
const fetchFromAgmarknet = async (crop, market) => {
  const apiKey = process.env.AGMARKNET_API_KEY;

  // If no API key is configured, skip the live call
  if (!apiKey) {
    logger.warn("AGMARKNET_API_KEY not set — using stored DB prices only.");
    return null;
  }

  try {
    // Agmarknet API endpoint
    // Docs: https://agmarknet.gov.in/SearchCmmMkt.aspx
    const response = await axios.get(
      "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070",
      {
        params: {
          "api-key": apiKey,
          format: "json",
          limit: 5,
          "filters[commodity]": crop,
          "filters[market]": market,
        },
        timeout: 8000, // 8 second timeout
      },
    );

    const records = response.data?.records;
    if (!records || records.length === 0) return null;

    // Pick the most recent record
    const latest = records[0];
    return {
      price: parseFloat(latest.modal_price) || 0,
      minPrice: parseFloat(latest.min_price) || 0,
      maxPrice: parseFloat(latest.max_price) || 0,
      arrivalQuantity: parseFloat(latest.arrivals_in_qtl) || 0,
      market: latest.market || market,
      district: latest.district || "",
      state: latest.state || "Maharashtra",
      tradeDate: new Date(latest.arrival_date) || new Date(),
      dataSource: "Agmarknet",
    };
  } catch (err) {
    // Log but don't crash — we'll fall back to DB
    logger.warn(`Agmarknet API failed: ${err.message}`);
    return null;
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTED SERVICE FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET CROP LIST
 * Returns the supported crops with names in all 3 languages.
 * No DB call needed — just returns the in-memory catalogue above.
 */
const getCropList = async () => {
  return CROP_CATALOGUE;
};

/**
 * GET LIVE PRICE
 * Returns the current market price for a crop at a specific market.
 *
 * Strategy:
 * 1. Check Redis cache (TTL: 30 min) — fastest, no DB/API call
 * 2. Call Agmarknet API — fresh live data
 * 3. Store result in MongoDB (for history) + Redis (for cache)
 * 4. If API fails: fetch latest from MongoDB as fallback
 */
const getLivePrice = async (crop, market) => {
  const cropLower = crop.toLowerCase().trim();
  const marketClean = market.trim();

  // ── Step 1: Check Redis cache ────────────────────────────────
  const cacheKey = `market:live:${cropLower}:${marketClean.toLowerCase()}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    logger.info(`Cache HIT: ${cacheKey}`);
    return { ...cached, fromCache: true };
  }
  logger.info(`Cache MISS: ${cacheKey} — fetching fresh data`);

  // ── Step 2: Call Agmarknet API ───────────────────────────────
  const liveData = await fetchFromAgmarknet(cropLower, marketClean);

  if (liveData) {
    // ── Step 3a: Save to MongoDB for history ──────────────────
    try {
      await MarketPrice.findOneAndUpdate(
        {
          crop: cropLower,
          market: marketClean,
          tradeDate: liveData.tradeDate,
        },
        {
          $set: {
            crop: cropLower,
            market: marketClean,
            price: liveData.price,
            minPrice: liveData.minPrice,
            maxPrice: liveData.maxPrice,
            arrivalQuantity: liveData.arrivalQuantity,
            district: liveData.district,
            state: liveData.state,
            tradeDate: liveData.tradeDate,
            dataSource: liveData.dataSource,
          },
        },
        { upsert: true, new: true }, // upsert = insert if not exists, update if exists
      );
    } catch (dbErr) {
      // Don't crash — DB write failing shouldn't stop the response
      logger.warn(`Failed to save price to DB: ${dbErr.message}`);
    }

    // ── Step 3b: Cache in Redis ───────────────────────────────
    const cropMeta = CROP_CATALOGUE.find((c) => c.id === cropLower);
    const result = {
      crop: cropLower,
      cropNameMr: cropMeta?.nameMr || crop,
      cropNameHi: cropMeta?.nameHi || crop,
      market: marketClean,
      price: liveData.price,
      minPrice: liveData.minPrice,
      maxPrice: liveData.maxPrice,
      unit: "quintal",
      arrivalQuantity: liveData.arrivalQuantity,
      dataSource: liveData.dataSource,
      tradeDate: liveData.tradeDate,
      fromCache: false,
    };
    await redis.set(cacheKey, result, CACHE_TTL_LIVE_PRICE);
    return result;
  }

  // ── Step 4: Fallback — most recent price from MongoDB ────────
  const dbRecord = await MarketPrice.findOne(
    { crop: cropLower, market: new RegExp(marketClean, "i") },
    null,
    { sort: { tradeDate: -1 } },
  );

  if (!dbRecord) {
    throw new AppError(
      `No price data found for ${crop} at ${market}. Try a different market or crop.`,
      404,
      "ERR_MKT_001",
    );
  }

  const cropMeta = CROP_CATALOGUE.find((c) => c.id === cropLower);
  return {
    crop: dbRecord.crop,
    cropNameMr: cropMeta?.nameMr || crop,
    cropNameHi: cropMeta?.nameHi || crop,
    market: dbRecord.market,
    price: dbRecord.price,
    minPrice: dbRecord.minPrice,
    maxPrice: dbRecord.maxPrice,
    unit: dbRecord.unit,
    arrivalQuantity: dbRecord.arrivalQuantity,
    dataSource: dbRecord.dataSource,
    tradeDate: dbRecord.tradeDate,
    fromCache: false,
    note: "Live API unavailable — showing most recent stored price.",
  };
};

/**
 * GET PRICE HISTORY
 * Returns historical daily prices for a crop+market over N days.
 * Used to draw price charts in the mobile app.
 */
const getPriceHistory = async (crop, market, days = 30) => {
  const cropLower = crop.toLowerCase().trim();
  const marketClean = market.trim();
  const daysNum = Math.min(parseInt(days) || 30, 365); // max 1 year

  // ── Check Redis cache ─────────────────────────────────────────
  const cacheKey = `market:history:${cropLower}:${marketClean.toLowerCase()}:${daysNum}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  // ── Query MongoDB ─────────────────────────────────────────────
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - daysNum);

  const records = await MarketPrice.find(
    {
      crop: cropLower,
      market: new RegExp(marketClean, "i"),
      tradeDate: { $gte: fromDate },
    },
    {
      price: 1,
      minPrice: 1,
      maxPrice: 1,
      tradeDate: 1,
      arrivalQuantity: 1,
      _id: 0,
    },
  ).sort({ tradeDate: 1 }); // oldest first (for chart display)

  if (records.length === 0) {
    throw new AppError(
      `No historical data found for ${crop} at ${market}.`,
      404,
      "ERR_MKT_002",
    );
  }

  const result = {
    crop: cropLower,
    market: marketClean,
    days: daysNum,
    records: records.map((r) => ({
      date: r.tradeDate,
      price: r.price,
      minPrice: r.minPrice,
      maxPrice: r.maxPrice,
      arrivalQuantity: r.arrivalQuantity,
    })),
    // Simple stats
    stats: {
      highest: Math.max(...records.map((r) => r.price)),
      lowest: Math.min(...records.map((r) => r.price)),
      average: Math.round(
        records.reduce((sum, r) => sum + r.price, 0) / records.length,
      ),
    },
  };

  await redis.set(cacheKey, result, CACHE_TTL_HISTORY);
  return result;
};

/**
 * GET PRICE PREDICTION
 * Predicts crop prices for the next N days.
 *
 * Right now this uses a statistical approach (moving average + trend).
 * When we build the Python AI microservice (Step 5), we'll replace this
 * with a real XGBoost/LSTM model call.
 *
 * The statistical model:
 * 1. Gets last 30 days of prices from DB
 * 2. Calculates 7-day moving average
 * 3. Detects trend (price going up or down)
 * 4. Projects forward N days with some randomness for realism
 */
const getPricePrediction = async (crop, market, days = 7) => {
  const cropLower = crop.toLowerCase().trim();
  const marketClean = market.trim();
  const daysNum = Math.min(parseInt(days) || 7, 30); // max 30 days prediction

  // ── Check cache (predictions don't change every minute) ───────
  const cacheKey = `market:predict:${cropLower}:${marketClean.toLowerCase()}:${daysNum}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  // ── Get last 30 days of historical data ───────────────────────
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 30);

  const history = await MarketPrice.find(
    {
      crop: cropLower,
      market: new RegExp(marketClean, "i"),
      tradeDate: { $gte: fromDate },
    },
    { price: 1, tradeDate: 1, _id: 0 },
  ).sort({ tradeDate: -1 }); // newest first

  if (history.length < 3) {
    throw new AppError(
      `Not enough historical data to predict prices for ${crop} at ${market}. Need at least 3 days of data.`,
      400,
      "ERR_MKT_003",
    );
  }

  const prices = history.map((h) => h.price);
  const latestPrice = prices[0];

  // ── Calculate 7-day moving average ───────────────────────────
  const window7 = prices.slice(0, Math.min(7, prices.length));
  const movingAvg = window7.reduce((sum, p) => sum + p, 0) / window7.length;

  // ── Detect trend ──────────────────────────────────────────────
  // Compare average of first 7 days vs last 7 days
  const recent = prices.slice(0, 7);
  const older = prices.slice(Math.max(0, prices.length - 7));
  const recentAvg = recent.reduce((s, p) => s + p, 0) / recent.length;
  const olderAvg = older.reduce((s, p) => s + p, 0) / older.length;
  const dailyTrend = (recentAvg - olderAvg) / Math.max(older.length, 1);

  // ── Generate predictions for next N days ─────────────────────
  const predictions = [];
  let projectedPrice = latestPrice;

  for (let i = 1; i <= daysNum; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);

    // Apply trend with slight dampening (trend weakens over time)
    projectedPrice = projectedPrice + dailyTrend * (1 - i * 0.05);

    // Add small realistic variance (±2%)
    const variance = projectedPrice * 0.02;
    const lowerBound = Math.round(projectedPrice - variance);
    const upperBound = Math.round(projectedPrice + variance);
    const predictedVal = Math.round(projectedPrice);

    predictions.push({
      date: date.toISOString().split("T")[0], // "2026-03-05"
      price: Math.max(predictedVal, 0), // never negative
      lowerBound: Math.max(lowerBound, 0),
      upperBound: Math.max(upperBound, 0),
    });
  }

  // ── Recommendation logic ──────────────────────────────────────
  const lastPredictedPrice = predictions[predictions.length - 1].price;
  const priceChangePercent =
    ((lastPredictedPrice - latestPrice) / latestPrice) * 100;

  let recommendation;
  if (priceChangePercent > 5) {
    recommendation = "HOLD"; // price going up — wait to sell
  } else if (priceChangePercent < -5) {
    recommendation = "SELL"; // price going down — sell now
  } else {
    recommendation = "NEUTRAL"; // stable — sell at your convenience
  }

  const result = {
    crop: cropLower,
    market: marketClean,
    currentPrice: latestPrice,
    predictions,
    recommendation,
    priceChangePercent: parseFloat(priceChangePercent.toFixed(2)),
    // Confidence is lower when we have less data
    confidenceScore: parseFloat(
      Math.min(0.6 + history.length / 100, 0.85).toFixed(2),
    ),
    modelVersion: "statistical-v1.0", // will change to "xgb-v1.0" in AI step
    note: "Prediction based on moving average + trend analysis. ML model coming in Step 5.",
    generatedAt: new Date().toISOString(),
  };

  await redis.set(cacheKey, result, CACHE_TTL_PREDICTION);
  return result;
};

/**
 * SEED TEST DATA
 * Adds sample price data to MongoDB so you can test the history + prediction
 * endpoints immediately without waiting for real Agmarknet data.
 *
 * Call: GET /api/v1/market/seed (only works in development mode)
 */
const seedTestData = async () => {
  if (process.env.NODE_ENV === "production") {
    throw new AppError(
      "Seed endpoint is disabled in production.",
      403,
      "ERR_FORBIDDEN",
    );
  }

  // Generate 60 days of fake onion prices for Lasalgaon
  const records = [];
  let price = 2200; // starting price

  for (let i = 60; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    // Simulate realistic price movement (random walk)
    const change = (Math.random() - 0.48) * 150; // slight upward bias
    price = Math.max(800, Math.min(5000, price + change));
    const roundedPrice = Math.round(price / 10) * 10;

    records.push({
      crop: "onion",
      cropNameMr: "कांदा",
      cropNameHi: "प्याज",
      market: "Lasalgaon",
      district: "Nashik",
      state: "Maharashtra",
      price: roundedPrice,
      minPrice: roundedPrice - 100,
      maxPrice: roundedPrice + 150,
      arrivalQuantity: Math.round(10000 + Math.random() * 5000),
      unit: "quintal",
      dataSource: "Seed Data",
      tradeDate: date,
    });
  }

  // bulkWrite with upsert — won't create duplicates if you run it twice
  const ops = records.map((r) => ({
    updateOne: {
      filter: { crop: r.crop, market: r.market, tradeDate: r.tradeDate },
      update: { $set: r },
      upsert: true,
    },
  }));

  const result = await MarketPrice.bulkWrite(ops);
  return {
    inserted: result.upsertedCount,
    updated: result.modifiedCount,
    total: records.length,
  };
};

module.exports = {
  getCropList,
  getLivePrice,
  getPriceHistory,
  getPricePrediction,
  seedTestData,
};
