// ================================================================
// PAYMENT SERVICE — Razorpay integration
// ================================================================
const crypto = require("crypto");
const { getRazorpayClient } = require("../../config/razorpay");
const Subscription = require("../../models/Subscription");
const User = require("../../models/User");
const { AppError } = require("../../middlewares/errorHandler");
const notificationService = require("../../services/notificationService");
const logger = require("../../utils/logger");

// ── Plan definitions ──────────────────────────────────────────────────────────
// Prices in PAISE (1 rupee = 100 paise)
const PLANS = {
  FREE: {
    name: "Free",
    monthly: 0,
    yearly: 0,
    features: ["Basic market prices", "Current weather", "5 voice queries/day"],
  },
  BASIC: {
    name: "Basic",
    monthly: 4900, // ₹49/month
    yearly: 49900, // ₹499/year (save ₹89)
    features: [
      "Live market prices + 30-day history",
      "7-day price prediction",
      "Weather risk alerts",
      "20 voice queries/day",
      "SMS notifications",
    ],
  },
  PREMIUM: {
    name: "Premium",
    monthly: 9900, // ₹99/month
    yearly: 99900, // ₹999/year (save ₹189)
    features: [
      "Everything in Basic",
      "Unlimited voice queries",
      "AI chatbot with farming knowledge",
      "Cattle health tracking",
      "Price drop/rise SMS alerts",
      "Learning courses",
      "Priority support",
    ],
  },
};

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Get all available plans — shown on the pricing screen
 */
const getPlans = async () => {
  return Object.entries(PLANS).map(([id, plan]) => ({
    id,
    ...plan,
    monthlyDisplay: `₹${plan.monthly / 100}`,
    yearlyDisplay: `₹${plan.yearly / 100}`,
    yearlySaving: `₹${(plan.monthly * 12 - plan.yearly) / 100}`,
  }));
};

/**
 * Create a Razorpay order
 *
 * Flow:
 * 1. App calls this → gets back an orderId + amount
 * 2. App opens Razorpay payment sheet with this orderId
 * 3. Farmer pays → Razorpay calls our webhook OR farmer returns to app
 * 4. App calls verifyPayment() with the payment response
 */
const createOrder = async (userId, plan, billing) => {
  const razorpay = getRazorpayClient();
  if (!razorpay) {
    throw new AppError("Payment gateway not configured.", 503, "ERR_PAY_001");
  }

  const planDetails = PLANS[plan];
  if (!planDetails) {
    throw new AppError(`Invalid plan: ${plan}`, 400, "ERR_PAY_002");
  }

  const amount =
    billing === "YEARLY" ? planDetails.yearly : planDetails.monthly;

  if (amount === 0) {
    throw new AppError(
      "Free plan does not require payment.",
      400,
      "ERR_PAY_003",
    );
  }

  // Create order in Razorpay
  const order = await razorpay.orders.create({
    amount, // in paise
    currency: "INR",
    receipt: `rcpt_${userId}_${Date.now()}`,
    notes: {
      userId: userId.toString(),
      plan,
      billing,
    },
  });

  logger.info(
    `Razorpay order created: ${order.id} | ₹${amount / 100} | ${plan} ${billing}`,
  );

  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID, // needed by frontend Razorpay SDK
    plan,
    billing,
    planName: planDetails.name,
    amountDisplay: `₹${amount / 100}`,
  };
};

/**
 * Verify payment signature and activate subscription
 *
 * This is called after the farmer completes payment on the Razorpay sheet.
 * We verify the signature to make sure the payment wasn't tampered with.
 */
const verifyPayment = async (
  userId,
  { razorpayOrderId, razorpayPaymentId, razorpaySignature, plan, billing },
) => {
  // ── Verify signature ───────────────────────────────────────
  // Razorpay generates a signature using HMAC-SHA256:
  // signature = HMAC_SHA256(orderId + "|" + paymentId, keySecret)
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  if (expectedSignature !== razorpaySignature) {
    logger.error(
      `Payment signature mismatch for user ${userId}. Possible fraud.`,
    );
    throw new AppError(
      "Payment verification failed. Signature mismatch.",
      400,
      "ERR_PAY_004",
    );
  }

  // ── Calculate subscription end date ────────────────────────
  const now = new Date();
  const endDate = new Date(now);
  if (billing === "YEARLY") {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }

  const planDetails = PLANS[plan];
  const amount =
    billing === "YEARLY" ? planDetails.yearly : planDetails.monthly;

  // ── Create or update subscription ──────────────────────────
  // If user already has a subscription, extend it; otherwise create new one
  const subscription = await Subscription.findOneAndUpdate(
    { userId },
    {
      $set: {
        plan,
        status: "ACTIVE",
        startDate: now,
        endDate,
        autoRenew: true,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        planDetails: {
          name: planDetails.name,
          pricePerMonth: planDetails.monthly,
          currency: "INR",
          features: planDetails.features,
        },
      },
      $push: {
        payments: {
          razorpayOrderId,
          razorpayPaymentId,
          amount,
          currency: "INR",
          status: "SUCCESS",
          paidAt: now,
        },
      },
    },
    { upsert: true, new: true },
  );

  logger.info(
    `Subscription activated: user ${userId} → ${plan} ${billing} until ${endDate.toDateString()}`,
  );

  // ── Send success notification ───────────────────────────────
  await notificationService.sendPaymentSuccessNotification(
    userId,
    planDetails.name,
    amount / 100, // convert paise to rupees for display
  );

  return {
    subscription,
    plan,
    billing,
    endDate,
    message: `${planDetails.name} plan activated successfully!`,
  };
};

/**
 * Razorpay Webhook handler
 *
 * Razorpay calls this URL automatically for payment events.
 * This is more reliable than the app callback because it happens
 * server-to-server even if the user's app crashes.
 */
const handleWebhook = async (rawBody, signature) => {
  // Verify webhook signature
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (expectedSignature !== signature) {
    throw new AppError("Invalid webhook signature.", 400, "ERR_PAY_005");
  }

  const event = JSON.parse(rawBody);
  logger.info(`Razorpay webhook: ${event.event}`);

  switch (event.event) {
    case "payment.captured": {
      // Payment was captured (money received)
      // The main activation is done in verifyPayment() above.
      // This is a backup confirmation.
      const payment = event.payload.payment.entity;
      logger.info(
        `Webhook: payment.captured | ${payment.id} | ₹${payment.amount / 100}`,
      );
      break;
    }
    case "payment.failed": {
      const payment = event.payload.payment.entity;
      const userId = payment.notes?.userId;

      if (userId) {
        // Log failed payment in subscription history
        await Subscription.findOneAndUpdate(
          { userId },
          {
            $push: {
              payments: {
                razorpayOrderId: payment.order_id,
                razorpayPaymentId: payment.id,
                amount: payment.amount,
                status: "FAILED",
                paidAt: new Date(),
                failureReason: payment.error_description || "Payment failed",
              },
            },
          },
        );
        logger.warn(
          `Webhook: payment.failed | user ${userId} | ${payment.error_description}`,
        );
      }
      break;
    }
    case "subscription.cancelled": {
      const sub = event.payload.subscription.entity;
      const userId = sub.notes?.userId;
      if (userId) {
        await Subscription.findOneAndUpdate(
          { userId },
          {
            $set: {
              status: "CANCELLED",
              cancelledAt: new Date(),
              autoRenew: false,
            },
          },
        );
        logger.info(`Webhook: subscription cancelled | user ${userId}`);
      }
      break;
    }
    default:
      logger.info(`Webhook: unhandled event ${event.event}`);
  }

  return { received: true };
};

/**
 * Get current subscription for a user
 */
const getMySubscription = async (userId) => {
  const subscription = await Subscription.findOne({ userId }).select(
    "-razorpaySignature -__v",
  );

  return (
    subscription || {
      plan: "FREE",
      status: "ACTIVE",
      features: PLANS.FREE.features,
    }
  );
};

/**
 * Check if user has access to a feature based on their plan
 * Used as a guard in other services
 */
const checkFeatureAccess = async (userId, requiredPlan) => {
  const planHierarchy = { FREE: 0, BASIC: 1, PREMIUM: 2 };
  const sub = await Subscription.findOne({ userId, status: "ACTIVE" });
  const userPlan = sub?.plan || "FREE";

  return planHierarchy[userPlan] >= planHierarchy[requiredPlan];
};

module.exports = {
  getPlans,
  createOrder,
  verifyPayment,
  handleWebhook,
  getMySubscription,
  checkFeatureAccess,
};
