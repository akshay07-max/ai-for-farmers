const paymentService = require("./payment.service");
const { sendSuccess, sendError } = require("../../utils/response");

// GET /api/v1/payments/plans — public
async function getPlans(req, res, next) {
  try {
    const plans = await paymentService.getPlans();
    sendSuccess(res, 200, "Plans fetched successfully.", { plans });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/payments/create-order — protected
async function createOrder(req, res, next) {
  try {
    const { plan, billing } = req.body;
    const result = await paymentService.createOrder(
      req.user._id,
      plan,
      billing,
    );
    sendSuccess(res, 201, "Order created. Open Razorpay checkout.", {
      order: result,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/payments/verify — protected
async function verifyPayment(req, res, next) {
  try {
    const result = await paymentService.verifyPayment(req.user._id, req.body);
    sendSuccess(res, 200, result.message, { subscription: result });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/payments/webhook — public (called by Razorpay server)
async function webhook(req, res, next) {
  try {
    // req.rawBody is set by the raw body middleware in routes
    const signature = req.headers["x-razorpay-signature"];
    const result = await paymentService.handleWebhook(req.rawBody, signature);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/payments/subscription — protected
async function getMySubscription(req, res, next) {
  try {
    const subscription = await paymentService.getMySubscription(req.user._id);
    sendSuccess(res, 200, "Subscription fetched.", { subscription });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPlans,
  createOrder,
  verifyPayment,
  webhook,
  getMySubscription,
};
