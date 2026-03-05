// ================================================================
// MARKET ROUTES
// ================================================================
const express = require("express");
const router = express.Router();
const controller = require("./market.controller");
const { protect } = require("../../middlewares/auth");

/**
 * GET /api/v1/market/crops
 * List all supported crops.
 * Public — no auth needed (farmers browsing before login).
 */
router.get("/crops", controller.getCropList);

/**
 * GET /api/v1/market/price?crop=onion&market=Lasalgaon
 * Get live price for a crop at a market.
 * Protected — must be logged in.
 */
router.get("/price", protect, controller.getLivePrice);

/**
 * GET /api/v1/market/history?crop=onion&market=Lasalgaon&days=30
 * Get price history for charts.
 * Protected — must be logged in.
 */
router.get("/history", protect, controller.getPriceHistory);

/**
 * GET /api/v1/market/predict?crop=onion&market=Lasalgaon&days=7
 * Get 7-day price prediction.
 * Protected — must be logged in.
 */
router.get("/predict", protect, controller.getPricePrediction);

/**
 * GET /api/v1/market/seed
 * Seed test data into the database.
 * Development only — controller blocks it in production.
 */
router.get("/seed", controller.seedTestData);

module.exports = router;
