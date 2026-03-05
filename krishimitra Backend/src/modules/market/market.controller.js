// ================================================================
// MARKET CONTROLLER
// ================================================================
const marketService = require("./market.service");
const { sendSuccess, sendError } = require("../../utils/response");

/**
 * GET /api/v1/market/crops
 * List all supported crops with multilingual names.
 * Public — no auth required.
 */
async function getCropList(req, res, next) {
  try {
    const crops = await marketService.getCropList();
    sendSuccess(res, 200, "Crop list fetched successfully.", { crops });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/market/price?crop=onion&market=Lasalgaon
 * Returns live/latest price for a crop at a market.
 * Checks Redis first (30 min cache), then Agmarknet API, then DB fallback.
 */
async function getLivePrice(req, res, next) {
  try {
    const { crop, market } = req.query;

    if (!crop || !market) {
      return sendError(
        res,
        400,
        "Both 'crop' and 'market' query params are required. Example: ?crop=onion&market=Lasalgaon",
        "ERR_VAL_001",
      );
    }

    const data = await marketService.getLivePrice(crop, market);
    sendSuccess(res, 200, "Live price fetched successfully.", {
      marketPrice: data,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/market/history?crop=onion&market=Lasalgaon&days=30
 * Returns historical daily prices for chart display.
 */
async function getPriceHistory(req, res, next) {
  try {
    const { crop, market, days } = req.query;

    if (!crop || !market) {
      return sendError(
        res,
        400,
        "Both 'crop' and 'market' query params are required.",
        "ERR_VAL_001",
      );
    }

    const data = await marketService.getPriceHistory(crop, market, days);
    sendSuccess(res, 200, "Price history fetched successfully.", {
      history: data,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/market/predict?crop=onion&market=Lasalgaon&days=7
 * Returns predicted prices for next N days.
 * Uses statistical model now; will use XGBoost/LSTM in Step 5 (AI service).
 */
async function getPricePrediction(req, res, next) {
  try {
    const { crop, market, days } = req.query;

    if (!crop || !market) {
      return sendError(
        res,
        400,
        "Both 'crop' and 'market' query params are required.",
        "ERR_VAL_001",
      );
    }

    const data = await marketService.getPricePrediction(crop, market, days);
    sendSuccess(res, 200, "Price prediction generated successfully.", {
      prediction: data,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/market/seed
 * Seeds 60 days of test onion price data into MongoDB.
 * Development only — blocked in production by the service layer.
 */
async function seedTestData(req, res, next) {
  try {
    const result = await marketService.seedTestData();
    sendSuccess(
      res,
      200,
      `Test data seeded: ${result.inserted} inserted, ${result.updated} updated.`,
      { seed: result },
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCropList,
  getLivePrice,
  getPriceHistory,
  getPricePrediction,
  seedTestData,
};
