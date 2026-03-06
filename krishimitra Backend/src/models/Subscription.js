// ================================================================
// SUBSCRIPTION MODEL
// Tracks which farmers are on which plan and payment history.
// ================================================================
const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    plan: {
      type: String,
      enum: ["FREE", "BASIC", "PREMIUM"],
      default: "FREE",
    },

    // Plan pricing (in paise — Razorpay uses paise, not rupees)
    // ₹99/month = 9900 paise
    // ₹899/year = 89900 paise
    planDetails: {
      name: { type: String },
      pricePerMonth: { type: Number }, // in paise
      currency: { type: String, default: "INR" },
      features: [{ type: String }],
    },

    // Status of this subscription
    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "CANCELLED", "PENDING_PAYMENT"],
      default: "ACTIVE",
    },

    // Dates
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date }, // null for free plan
    cancelledAt: { type: Date },

    // Razorpay references
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySubscriptionId: { type: String },
    razorpaySignature: { type: String },

    // Payment history (every successful/failed payment stored here)
    payments: [
      {
        razorpayOrderId: String,
        razorpayPaymentId: String,
        amount: Number, // in paise
        currency: { type: String, default: "INR" },
        status: { type: String, enum: ["SUCCESS", "FAILED", "REFUNDED"] },
        method: String, // "upi", "card", "netbanking"
        paidAt: Date,
        failureReason: String,
      },
    ],

    // Auto-renewal setting
    autoRenew: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
