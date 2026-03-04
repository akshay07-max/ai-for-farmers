const rateLimit = require("express-rate-limit");

// General API rate limiter applied to all /api routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Stricter limiter specifically for auth routes (login, register, etc.)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 auth requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    errorCode: "ERR_TOO_MANY_REQUESTS",
    message:
      "Too many authentication attempts from this IP, please try again later.",
  },
});

module.exports = {
  apiLimiter,
  authLimiter,
};

