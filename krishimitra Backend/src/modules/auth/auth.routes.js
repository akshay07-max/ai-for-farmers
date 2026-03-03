// ============================================================
// AUTH ROUTES
// ============================================================
const express = require("express");
const router = express.Router();

const authController = require("./auth.controller");
const validate = require("../../middleware/validate");
const { protect } = require("../../middleware/auth");
const { authLimiter } = require("../../middleware/rateLimiter");
const {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("./auth.schema");

// Apply auth rate limiter to ALL auth routes
router.use(authLimiter);

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post("/register", validate(registerSchema), authController.register);

/**
 * @route   POST /api/v1/auth/verify-otp
 * @desc    Verify phone OTP after registration
 * @access  Public
 */
router.post("/verify-otp", validate(verifyOtpSchema), authController.verifyOtp);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login and get tokens
 * @access  Public
 */
router.post("/login", validate(loginSchema), authController.login);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Get new access token using refresh token
 * @access  Public
 */
router.post("/refresh", validate(refreshSchema), authController.refresh);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout and revoke tokens
 * @access  Private (requires valid access token)
 */
router.post("/logout", protect, authController.logout);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Send OTP for password reset
 * @access  Public
 */
router.post(
  "/forgot-password",
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password using OTP
 * @access  Public
 */
router.post(
  "/reset-password",
  validate(resetPasswordSchema),
  authController.resetPassword,
);

module.exports = router;
