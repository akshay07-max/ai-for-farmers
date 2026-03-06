// ================================================================
// KRISHIMITRA AI — MAIN SERVER FILE (Step 3 update)
// ================================================================
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");

const connectDB = require("./config/db");
const { connectRedis } = require("./config/redis");
const { initTwilio } = require("./config/twilio");
const { initFirebase } = require("./config/firebase");
const { initRazorpay } = require("./config/razorpay");
const { startCronJobs } = require("./jobs/index");
const { errorHandler } = require("./middlewares/errorHandler");
const { apiLimiter } = require("./middlewares/rateLimiter");
const logger = require("./utils/logger");

// ── Route modules ─────────────────────────────────────────────────
const authRoutes = require("./modules/auth/auth.routes");
const userRoutes = require("./modules/users/users.routes");
const marketRoutes = require("./modules/market/market.routes");
const notifRoutes = require("./modules/notifications/notification.routes");
const paymentRoutes = require("./modules/payments/payment.routes");
// Upcoming:
// const weatherRoutes  = require("./modules/weather/weather.routes");
// const voiceRoutes    = require("./modules/voice/voice.routes");
// const chatRoutes     = require("./modules/chat/chat.routes");
// const cattleRoutes   = require("./modules/cattle/cattle.routes");
// const learningRoutes = require("./modules/learning/learning.routes");
// const adminRoutes    = require("./modules/admin/admin.routes");

const app = express();

// ── Connect databases ─────────────────────────────────────────────
connectDB();
connectRedis();

// ── Initialize external services ─────────────────────────────────
initTwilio(); // Real SMS
initFirebase(); // Push notifications
initRazorpay(); // Payments

// ── Start background jobs (after DB is ready) ─────────────────────
// Small delay to ensure DB connection is established first
setTimeout(() => startCronJobs(), 3000);

// ── Security ──────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept-Language"],
    credentials: true,
  }),
);

// ── Performance ───────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Logging ───────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(
    morgan("combined", {
      stream: { write: (msg) => logger.info(msg.trim()) },
    }),
  );
}

// ── Rate limiting ─────────────────────────────────────────────────
app.use("/api", apiLimiter);

// ── Health check ──────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "krishimitra-backend",
    version: "1.0.0",
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────────
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/market", marketRoutes);
app.use("/api/v1/notifications", notifRoutes);
app.use("/api/v1/payments", paymentRoutes);

// ── 404 ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    errorCode: "ERR_NOT_FOUND",
    message: `Route '${req.method} ${req.originalUrl}' not found.`,
  });
});

// ── Global error handler ──────────────────────────────────────────
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────
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

  process.on("SIGTERM", () => {
    logger.info("SIGTERM — shutting down gracefully...");
    server.close(() => {
      logger.info("Server closed.");
      process.exit(0);
    });
  });
}

module.exports = app;
