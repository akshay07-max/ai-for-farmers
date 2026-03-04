function sendSuccess(res, statusCode, message, data = null) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
}

function sendError(res, statusCode, message, errorCode = "ERR_GENERIC", details) {
  return res.status(statusCode).json({
    success: false,
    errorCode,
    message,
    details,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  sendSuccess,
  sendError,
};

