const logger = require("../utils/logger");

// Global error-handling middleware for Express
function errorHandler(err, req, res, next) {
  logger.error(
    `Unhandled error for ${req.method} ${req.originalUrl}: ${
      err.stack || err.message || err
    }`,
  );

  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    errorCode: err.code || "ERR_INTERNAL_SERVER_ERROR",
    message: err.message || "Something went wrong on the server.",
  });
}

module.exports = {
  errorHandler,
};

