// ================================================================
// AUTH CONTROLLER — handles HTTP layer only.
// Each function reads req, calls the service, and sends the response.
// All logic is in auth.service.js.
// ================================================================
const authService     = require("./auth.service");
const { sendSuccess } = require("../../utils/response");

// POST /api/v1/auth/register
async function register(req, res, next) {
  try {
    const result = await authService.register(req.body, {
      ip:        req.ip,
      userAgent: req.headers["user-agent"],
    });
    sendSuccess(res, 201,
      "Registration successful! Check your phone for the OTP.",
      { userId: result.userId }
    );
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/verify-otp
async function verifyOtp(req, res, next) {
  try {
    const result = await authService.verifyOtp(req.body.phone, req.body.otp);
    sendSuccess(res, 200, result.message);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/login
async function login(req, res, next) {
  try {
    const result = await authService.login(req.body, {
      ip:        req.ip,
      userAgent: req.headers["user-agent"],
    });
    sendSuccess(res, 200, "Login successful!", {
      accessToken:        result.accessToken,
      refreshToken:       result.refreshToken,
      role:               result.role,
      userId:             result.userId,
      name:               result.name,
      languagePreference: result.languagePreference,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/refresh
async function refresh(req, res, next) {
  try {
    const result = await authService.refreshAccessToken(req.body.refreshToken);
    sendSuccess(res, 200, "Token refreshed successfully.", {
      accessToken:  result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/logout  (protected — needs valid token)
async function logout(req, res, next) {
  try {
    // req.user and req.token are set by the protect middleware
    await authService.logout(
      req.user._id,
      req.token,
      req.body.refreshToken
    );
    sendSuccess(res, 200, "You have been logged out successfully.");
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/forgot-password
async function forgotPassword(req, res, next) {
  try {
    const result = await authService.forgotPassword(req.body.phone);
    sendSuccess(res, 200, result.message);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/reset-password
async function resetPassword(req, res, next) {
  try {
    const result = await authService.resetPassword(req.body);
    sendSuccess(res, 200, result.message);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  verifyOtp,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
};