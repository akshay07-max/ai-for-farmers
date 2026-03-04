// ================================================================
// KRISHIMITRA AI — MAIN SERVER FILE
// This is the entry point of the entire backend application.
// ================================================================

// IMPORTANT: Load .env variables FIRST, before anything else
require("dotenv").config();

// This package auto-catches async errors so we don't need
// try-catch in every route handler. Must be required early.
require("express-async-errors");

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

// Import all route modules
const authRoutes = require("./modules/auth/auth.routes");
const userRoutes = require("./modules/users/users.routes");
// The other routes (market, cattle, weather, etc.) will be added in future steps:
// const voiceRoutes  = require('./modules/voice/voice.routes');
// const chatRoutes   = require('./modules/chat/chat.routes');
// const marketRoutes = require('./modules/market/market.routes');
// const weatherRoutes= require('./modules/weather/weather.routes');
// const cattleRoutes = require('./modules/cattle/cattle.routes');
// const learningRoutes = require('./modules/learning/learning.routes');
// const notifRoutes  = require('./modules/notifications/notification.routes');
// const adminRoutes  = require('./modules/admin/admin.routes');

// ── Create Express app ──────────────────────────────────────────
const app = express();

// ── Connect to databases ────────────────────────────────────────
connectDB(); // MongoDB (required — app exits if this fails)
connectRedis(); // Redis   (optional in dev — app continues if this fails)

// ── Security Middleware ─────────────────────────────────────────

// helmet() automatically sets security HTTP response headers.
// It protects against XSS, clickjacking, and other common attacks.
app.use(helmet());

// CORS: Which origins (frontends) are allowed to call this API.
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept-Language"],
    credentials: true,
  }),
);

// ── Performance Middleware ──────────────────────────────────────

// compression() gzips responses to make them smaller and faster.
app.use(compression());

// Parse JSON request bodies (e.g. {"phone": "9876543210"})
// Limit 10mb — enough for base64 encoded audio in future steps
app.use(express.json({ limit: "10mb" }));

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── HTTP Request Logging ────────────────────────────────────────
// morgan logs every request: GET /api/v1/auth/login 200 42ms
if (process.env.NODE_ENV !== "test") {
  app.use(
    morgan("combined", {
      stream: { write: (message) => logger.info(message.trim()) },
    }),
  );
}

// ── Rate Limiting ───────────────────────────────────────────────
// Apply general rate limit to all /api routes
app.use("/api", apiLimiter);

// ================================================================
// ROUTES
// ================================================================

// Health check — no auth, no rate limit.
// Used by AWS load balancer to check if server is alive.
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "krishimitra-backend",
    version: "1.0.0",
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// API v1 Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
// Future routes (uncomment as we build each step):
// app.use('/api/v1/voice',          voiceRoutes);
// app.use('/api/v1/chat',           chatRoutes);
// app.use('/api/v1/market',         marketRoutes);
// app.use('/api/v1/weather',        weatherRoutes);
// app.use('/api/v1/cattle',         cattleRoutes);
// app.use('/api/v1/learning',       learningRoutes);
// app.use('/api/v1/notifications',  notifRoutes);
// app.use('/api/v1/admin',          adminRoutes);

// ── 404 Handler ─────────────────────────────────────────────────
// If no route above matched, send a 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    errorCode: "ERR_NOT_FOUND",
    message: `Route '${req.method} ${req.originalUrl}' not found.`,
  });
});

// ── Global Error Handler ────────────────────────────────────────
// MUST be the very last middleware (after all routes)
app.use(errorHandler);

// ================================================================
// START SERVER
// ================================================================
// Only start listening if this file is run directly (not imported in tests)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    logger.info("════════════════════════════════════");
    logger.info("  🌾 KrishiMitra AI Backend Started");
    logger.info(`  📡 Port        : ${PORT}`);
    logger.info(`  🌍 Environment : ${process.env.NODE_ENV}`);
    logger.info(`  🔗 API Base    : http://localhost:${PORT}/api/v1`);
    logger.info(`  💚 Health      : http://localhost:${PORT}/health`);
    logger.info("════════════════════════════════════");
  });

  // Graceful shutdown: close DB connections when server is stopped (Ctrl+C)
  process.on("SIGTERM", () => {
    logger.info("SIGTERM received — shutting down gracefully...");
    server.close(() => {
      logger.info("Server closed. Goodbye!");
      process.exit(0);
    });
  });
}

// Export for testing (supertest imports the app without starting a server)
module.exports = app;
