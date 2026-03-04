const jwt = require("jsonwebtoken");

/**
 * Basic authentication middleware.
 * - Expects `Authorization: Bearer <token>` header
 * - Verifies JWT using ACCESS_TOKEN_SECRET from env
 * - On success, attaches decoded payload to `req.user` and calls next()
 * - On failure, responds with 401/403
 */
function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const [, token] = authHeader.split(" ");

    if (!token) {
      return res.status(401).json({
        success: false,
        errorCode: "ERR_UNAUTHORIZED",
        message: "Authorization token missing.",
      });
    }

    const secret = process.env.ACCESS_TOKEN_SECRET;
    if (!secret) {
      return res.status(500).json({
        success: false,
        errorCode: "ERR_SERVER_MISCONFIG",
        message: "ACCESS_TOKEN_SECRET is not configured on the server.",
      });
    }

    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      errorCode: "ERR_INVALID_TOKEN",
      message: "Invalid or expired token.",
    });
  }
}

module.exports = {
  protect,
};

