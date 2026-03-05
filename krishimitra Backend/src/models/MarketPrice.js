const mongoose = require("mongoose");

/**
 * MarketPrice — stores live market prices fetched from Agmarknet.
 *
 * We store prices in MongoDB so that:
 * 1. We have history for the prediction model
 * 2. We can show price charts in the app
 * 3. We have a fallback if the external API is down
 */
const marketPriceSchema = new mongoose.Schema(
  {
    crop: {
      type: String,
      required: true,
      trim: true,
      lowercase: true, // always stored as lowercase: "onion", "wheat"
    },
    cropNameMr: { type: String, trim: true }, // Marathi name: "कांदा"
    cropNameHi: { type: String, trim: true }, // Hindi name: "प्याज"

    market: {
      type: String,
      required: true,
      trim: true, // e.g. "Lasalgaon"
    },
    district: { type: String, trim: true }, // e.g. "Nashik"
    state: { type: String, trim: true, default: "Maharashtra" },

    // Price data
    price: { type: Number, required: true }, // modal/average price
    minPrice: { type: Number }, // lowest price of the day
    maxPrice: { type: Number }, // highest price of the day
    unit: { type: String, default: "quintal" },

    // How much crop arrived at the mandi that day (in quintals)
    arrivalQuantity: { type: Number },

    // Where we got this data from
    dataSource: {
      type: String,
      default: "Agmarknet",
    },

    // The date this price was recorded (just the date, not time)
    tradeDate: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

// ── Indexes for fast queries ──────────────────────────────────────
// We frequently query by crop + market + tradeDate
marketPriceSchema.index({ crop: 1, market: 1, tradeDate: -1 });

// Prevent duplicate entries for same crop+market+date
marketPriceSchema.index({ crop: 1, market: 1, tradeDate: 1 }, { unique: true });

module.exports = mongoose.model("MarketPrice", marketPriceSchema);
