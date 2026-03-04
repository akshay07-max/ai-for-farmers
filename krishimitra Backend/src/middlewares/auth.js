const jwt   = require("jsonwebtoken");
const User  = require("../models/User");
const { redis } = require("../config/redis");

/**
 * protect — verifies a JWT access token on protected routes.
 *
 * Usage in any route file:
 *   const { protect } = require('../../middlewares/auth');
 *   router.post('/logout', protect, controller.logout);
 *
 * What it does:
 * 1. Reads Authorization: Bearer <token> from the request header
 * 2. Checks the token wasn't blacklisted (i.e. user already logged out)
 * 3. Verifies JWT signature + expiry
 * 4. Loads the full user from MongoDB
 * 5. Attaches user to req.user so controllers can use it
 */
async function protect(req, res, next) {
  try {
    // Step 1 — extract token from header
    const authHeader = req.headers.authorization || "";
    const [, token]  = authHeader.split(" ");

    if (!token) {
      return res.status(401).json({
        success:   false,
        errorCode: "ERR_UNAUTHORIZED",
        message:   "No token provided. Please login to access this.",
      });
    }

    // Step 2 — check if token was blacklisted (user logged out)
    const isBlacklisted = await redis.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        success:   false,
        errorCode: "ERR_UNAUTHORIZED",
        message:   "Session has been logged out. Please login again.",
      });
    }

    // Step 3 — verify JWT signature and expiry
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      return res.status(500).json({
        success:   false,
        errorCode: "ERR_SERVER_MISCONFIG",
        message:   "JWT_ACCESS_SECRET is not configured on the server.",
      });
    }

    const decoded = jwt.verify(token, secret);
    // decoded = { userId: '...', role: 'FARMER', iat: ..., exp: ... }

    // Step 4 — make sure user still exists and is active
    const user = await User.findById(decoded.userId).select(
      "-passwordHash -refreshTokens"
    );
    if (!user || !user.isActive) {
      return res.status(401).json({
        success:   false,
        errorCode: "ERR_UNAUTHORIZED",
        message:   "User account not found or has been deactivated.",
      });
    }

    // Step 5 — attach to request for downstream handlers
    req.user  = user;
    req.token = token;

    return next();
  } catch (err) {
    // JWT errors (expired, malformed) bubble up here
    return res.status(403).json({
      success:   false,
      errorCode: "ERR_INVALID_TOKEN",
      message:   "Invalid or expired token. Please login again.",
    });
  }
}

/**
 * restrictTo — limits a route to specific roles.
 *
 * Usage (MUST come after protect):
 *   router.get('/admin/users', protect, restrictTo('ADMIN'), controller);
 *   router.post('/cattle',     protect, restrictTo('FARMER', 'ADMIN'), controller);
 */
function restrictTo(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success:   false,
        errorCode: "ERR_FORBIDDEN",
        message:   `Access denied. Only ${roles.join(" or ")} can do this.`,
      });
    }
    next();
  };
}

module.exports = { protect, restrictTo };