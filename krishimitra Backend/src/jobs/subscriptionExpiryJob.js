// ================================================================
// SUBSCRIPTION EXPIRY JOB
// Runs daily at 9 AM. Warns farmers before their plan expires.
// Sends warnings at: 7 days, 3 days, 1 day before expiry.
// ================================================================
const Subscription = require("../models/Subscription");
const notificationService = require("../services/notificationService");
const logger = require("../utils/logger");

const checkSubscriptionExpiry = async () => {
  const now = new Date();
  const in7Days = new Date(now);
  in7Days.setDate(now.getDate() + 7);
  const in3Days = new Date(now);
  in3Days.setDate(now.getDate() + 3);
  const in1Day = new Date(now);
  in1Day.setDate(now.getDate() + 1);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 2);

  let warned = 0;

  // Find all active subscriptions expiring in the next 7 days
  const expiringSoon = await Subscription.find({
    status: "ACTIVE",
    plan: { $ne: "FREE" },
    endDate: { $gte: now, $lte: in7Days },
  }).select("userId plan endDate");

  for (const sub of expiringSoon) {
    const daysLeft = Math.ceil((sub.endDate - now) / (1000 * 60 * 60 * 24));

    // Only notify on specific days to avoid spamming
    if ([7, 3, 1].includes(daysLeft)) {
      await notificationService.sendSubscriptionExpiryWarning(
        sub.userId,
        daysLeft,
        sub.plan,
      );
      warned++;
      logger.info(
        `[SubExpiry] Warned user ${sub.userId}: ${sub.plan} expires in ${daysLeft} days`,
      );
    }
  }

  // Mark expired subscriptions as EXPIRED
  const expiredResult = await Subscription.updateMany(
    { status: "ACTIVE", plan: { $ne: "FREE" }, endDate: { $lt: now } },
    { $set: { status: "EXPIRED" } },
  );

  logger.info(
    `[SubExpiry] Complete: ${warned} warnings sent, ${expiredResult.modifiedCount} subscriptions marked expired`,
  );
};

module.exports = { checkSubscriptionExpiry };
