const express = require("express");
const router = express.Router();
const controller = require("./payment.controller");
const validate = require("../../middlewares/validate");
const { protect } = require("../../middlewares/auth");
const { createOrderSchema, verifyPaymentSchema } = require("./payment.schema");

// Public — no auth needed
router.get("/plans", controller.getPlans);

// Webhook — Razorpay calls this server-to-server
// IMPORTANT: Must use raw body (not parsed JSON) for signature verification
router.post(
  "/webhook",
  express.raw({ type: "application/json" }), // capture raw body
  (req, res, next) => {
    // Attach raw body as string for signature verification
    req.rawBody = req.body.toString("utf8");
    next();
  },
  controller.webhook,
);

// Protected — requires login
router.post(
  "/create-order",
  protect,
  validate(createOrderSchema),
  controller.createOrder,
);
router.post(
  "/verify",
  protect,
  validate(verifyPaymentSchema),
  controller.verifyPayment,
);
router.get("/subscription", protect, controller.getMySubscription);

module.exports = router;
