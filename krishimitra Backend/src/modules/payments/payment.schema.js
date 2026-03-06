const { z } = require("zod");

// Create a new order before showing the Razorpay payment screen
const createOrderSchema = z.object({
  plan: z.enum(["BASIC", "PREMIUM"], {
    required_error: "Plan is required. Choose BASIC or PREMIUM.",
  }),
  // MONTHLY or YEARLY billing
  billing: z.enum(["MONTHLY", "YEARLY"]).default("MONTHLY"),
});

// Verify payment after the Razorpay popup closes successfully
const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string({ required_error: "Order ID is required" }),
  razorpayPaymentId: z.string({ required_error: "Payment ID is required" }),
  razorpaySignature: z.string({ required_error: "Signature is required" }),
  plan: z.enum(["BASIC", "PREMIUM"]),
  billing: z.enum(["MONTHLY", "YEARLY"]).default("MONTHLY"),
});

module.exports = { createOrderSchema, verifyPaymentSchema };
