// ============================================================
// KRISHIMITRA AI - MAIN APPLICATION ENTRY POINT
// ============================================================
require("dotenv").config(); // Load .env FIRST before anything else
require("express-async-errors"); // Auto-catch async errors (no try-catch needed in routes)

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");

const connectDB = require("./config/db");
const { connectRedis } = require("./config/redis");
const { errorHandler } = require("./middleware/errorHandler");
const { apiLimiter } = require("./middleware/rateLimiter");
const logger = require("./utils/logger");

// Import routes
const authRoutes = require("./modules/auth/auth.routes");
const userRoutes = require("./modules/users/users.routes");

// ---- Initialize App ----
const app = express();

// ---- Connect to databases ----
connectDB();
connectRedis();

// ---- Security Middleware ----
// Helmet adds security HTTP headers
app.use(helmet());

// CORS - who can call our API
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept-Language"],
    credentials: true,
  }),
);

// ---- Performance Middleware ----
app.use(compression()); // Compress responses (gzip)
app.use(express.json({ limit: "10mb" })); // Parse JSON body
app.use(express.urlencoded({ extended: true, limit: "10mb" })); // Parse form data

// ---- Logging ----
// Morgan logs each HTTP request: method, url, status, response time
if (process.env.NODE_ENV !== "test") {
  app.use(
    morgan("combined", {
      stream: { write: (message) => logger.info(message.trim()) },
    }),
  );
}

// ---- Apply rate limiter to all /api routes ----
app.use("/api", apiLimiter);

// ============================================================
// ROUTES
// ============================================================

// Health check (no auth needed - used by load balancer)
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "krishimitra-backend",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// API v1 Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);

// Placeholder routes - we'll build these in upcoming steps
// app.use('/api/v1/voice', voiceRoutes);
// app.use('/api/v1/chat', chatRoutes);
// app.use('/api/v1/market', marketRoutes);
// app.use('/api/v1/weather', weatherRoutes);
// app.use('/api/v1/cattle', cattleRoutes);
// app.use('/api/v1/learning', learningRoutes);
// app.use('/api/v1/notifications', notificationRoutes);
// app.use('/api/v1/admin', adminRoutes);

// 404 Handler - If no route matched
app.use((req, res) => {
  res.status(404).json({
    success: false,
    errorCode: "ERR_NOT_FOUND",
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ---- Global Error Handler (MUST be last middleware) ----
app.use(errorHandler);

// ---- Start Server ----
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info(`====================================`);
  logger.info(` KrishiMitra AI Backend Running`);
  logger.info(` Port: ${PORT}`);
  logger.info(` Environment: ${process.env.NODE_ENV}`);
  logger.info(` API: http://localhost:${PORT}/api/v1`);
  logger.info(` Health: http://localhost:${PORT}/health`);
  logger.info(`====================================`);
});

// Graceful shutdown - when server is stopped, close DB connections
process.on("SIGTERM", () => {
  logger.info("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    logger.info("Server closed.");
    process.exit(0);
  });
});

module.exports = app; // Export for testing
