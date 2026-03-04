const logger = require("../utils/logger");

// ── AppError class ────────────────────────────────────────────────────────────
/**
 * Use this to throw structured errors anywhere in the app.
 *
 * Example:
 *   throw new AppError("Phone already registered", 409, "ERR_AUTH_001");
 *
 * The errorHandler middleware below catches it and sends a clean JSON response.
 */
class AppError extends Error {
  constructor(message, statusCode, errorCode) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode  = errorCode;
    this.name       = "AppError";
  }
}

// ── Global error handler ──────────────────────────────────────────────────────
// This MUST be the last app.use() in app.js (after all routes).
// Express knows it is an error handler because it takes 4 arguments.
function errorHandler(err, req, res, next) {
  logger.error(
    `Unhandled error for ${req.method} ${req.originalUrl}: ${
      err.stack || err.message || err
    }`
  );

  // ── Mongoose duplicate key (e.g. phone already exists in DB) ──
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(409).json({
      success:   false,
      errorCode: "ERR_DUPLICATE",
      message:   `${field} already exists.`,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Mongoose validation error (required field missing, etc.) ──
  if (err.name === "ValidationError") {
    const details = Object.values(err.errors).map((e) => ({
      field:   e.path,
      message: e.message,
    }));
    return res.status(400).json({
      success:   false,
      errorCode: "ERR_VALIDATION_FAILED",
      message:   "Validation failed.",
      details,
      timestamp: new Date().toISOString(),
    });
  }

  // ── JWT errors ──
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success:   false,
      errorCode: "ERR_INVALID_TOKEN",
      message:   "Invalid token. Please login again.",
      timestamp: new Date().toISOString(),
    });
  }
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success:   false,
      errorCode: "ERR_TOKEN_EXPIRED",
      message:   "Session expired. Please login again.",
      timestamp: new Date().toISOString(),
    });
  }

  // ── Our own AppError (thrown with: throw new AppError(...)) ──
  if (err.name === "AppError") {
    return res.status(err.statusCode).json({
      success:   false,
      errorCode: err.errorCode || "ERR_APP",
      message:   err.message,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Fallback 500 ──
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success:   false,
    errorCode: err.code || "ERR_INTERNAL_SERVER_ERROR",
    message:   err.message || "Something went wrong on the server.",
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  errorHandler,
  AppError,       // ← this is what auth.service.js needs
};