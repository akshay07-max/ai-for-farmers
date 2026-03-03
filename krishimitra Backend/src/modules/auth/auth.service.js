// ============================================================
// AUTH SERVICE - Business logic for authentication
// ============================================================
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const User = require("../../models/User");
const AuditLog = require("../../models/AuditLog");
const { redis } = require("../../config/redis");
const { AppError } = require("../../middleware/errorHandler");
const logger = require("../../utils/logger");

// ---- TOKEN HELPERS ----

/**
 * Generate a JWT access token (short-lived: 15 min)
 */
const generateAccessToken = (userId, role) => {
  return jwt.sign({ userId, role }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m",
  });
};

/**
 * Generate a refresh token (long-lived: 7 days)
 * We use a random UUID - not a JWT - for refresh tokens
 * This makes them easy to revoke from the database
 */
const generateRefreshToken = () => uuidv4();

// ---- OTP HELPERS ----

/**
 * Generate a 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send OTP (in development: just log it, in production: use SMS provider)
 */
const sendOTP = async (phone, otp) => {
  if (process.env.NODE_ENV === "development") {
    // In development, just print the OTP so you can use it for testing
    logger.info(`=====================================`);
    logger.info(`  OTP for ${phone}: ${otp}`);
    logger.info(`  (Development mode - not sending SMS)`);
    logger.info(`=====================================`);
    return true;
  }

  // TODO: In production, integrate Twilio or AWS SNS here
  // Example with Twilio:
  // const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  // await twilio.messages.create({
  //   body: `Your KrishiMitra OTP is: ${otp}. Valid for 10 minutes.`,
  //   from: process.env.TWILIO_PHONE,
  //   to: `+91${phone}`,
  // });
  return true;
};

// ---- AUTH OPERATIONS ----

/**
 * Register a new user
 */
const register = async (userData, meta = {}) => {
  // Check if phone already exists
  const existingUser = await User.findOne({ phone: userData.phone });
  if (existingUser) {
    throw new AppError("Phone number already registered.", 409, "ERR_AUTH_001");
  }

  // Create user (password will be hashed by the model's pre-save hook)
  const user = await User.create({
    name: userData.name,
    phone: userData.phone,
    passwordHash: userData.password, // Model hashes this automatically
    role: userData.role,
    village: userData.village,
    district: userData.district,
    state: userData.state,
    pincode: userData.pincode,
    languagePreference: userData.languagePreference,
  });

  // Generate and store OTP in Redis (expires in 10 minutes)
  const otp = generateOTP();
  const otpKey = `otp:register:${userData.phone}`;
  await redis.set(otpKey, { otp, userId: user._id.toString() }, 10 * 60);

  // Send OTP
  await sendOTP(userData.phone, otp);

  // Log this action
  await AuditLog.create({
    userId: user._id,
    action: "REGISTER",
    resource: "/auth/register",
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    statusCode: 201,
  });

  return { userId: user._id };
};

/**
 * Verify OTP (phone verification after registration)
 */
const verifyOtp = async (phone, otp) => {
  const otpKey = `otp:register:${phone}`;
  const stored = await redis.get(otpKey);

  if (!stored) {
    throw new AppError(
      "OTP expired or not found. Please register again.",
      400,
      "ERR_AUTH_002",
    );
  }

  if (stored.otp !== otp) {
    throw new AppError(
      "Invalid OTP. Please check and try again.",
      400,
      "ERR_AUTH_002",
    );
  }

  // Mark user as verified
  const user = await User.findByIdAndUpdate(
    stored.userId,
    { isVerified: true },
    { new: true },
  );

  // Delete used OTP from Redis
  await redis.del(otpKey);

  // Log this action
  await AuditLog.create({
    userId: user._id,
    action: "OTP_VERIFIED",
    resource: "/auth/verify-otp",
    statusCode: 200,
  });

  return { message: "Phone verified successfully" };
};

/**
 * Login
 */
const login = async ({ phone, password, fcmToken }, meta = {}) => {
  // Find user - explicitly select passwordHash (it's hidden by default)
  const user = await User.findOne({ phone }).select(
    "+passwordHash +refreshTokens",
  );

  if (!user || !user.isActive) {
    throw new AppError(
      "Invalid phone number or password.",
      401,
      "ERR_AUTH_003",
    );
  }

  // Check password
  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new AppError(
      "Invalid phone number or password.",
      401,
      "ERR_AUTH_003",
    );
  }

  // Check if verified
  if (!user.isVerified) {
    // Re-send OTP
    const otp = generateOTP();
    await redis.set(
      `otp:register:${phone}`,
      { otp, userId: user._id.toString() },
      10 * 60,
    );
    await sendOTP(phone, otp);
    throw new AppError(
      "Phone not verified. A new OTP has been sent to your number.",
      403,
      "ERR_AUTH_006",
    );
  }

  // Generate tokens
  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken();

  // Save refresh token to user's list (supports multi-device)
  // Keep only last 5 refresh tokens (5 devices)
  user.refreshTokens = [...(user.refreshTokens || []).slice(-4), refreshToken];
  user.fcmToken = fcmToken || user.fcmToken;
  user.lastLoginAt = new Date();
  await user.save();

  // Log this action
  await AuditLog.create({
    userId: user._id,
    action: "LOGIN",
    resource: "/auth/login",
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    statusCode: 200,
  });

  return {
    accessToken,
    refreshToken,
    role: user.role,
    userId: user._id,
    name: user.name,
    languagePreference: user.languagePreference,
  };
};

/**
 * Refresh access token
 */
const refreshAccessToken = async (refreshToken) => {
  // Find user who has this refresh token
  const user = await User.findOne({ refreshTokens: refreshToken }).select(
    "+refreshTokens",
  );

  if (!user) {
    throw new AppError(
      "Invalid refresh token. Please login again.",
      401,
      "ERR_AUTH_004",
    );
  }

  // Generate new tokens (token rotation - old refresh token is replaced)
  const newAccessToken = generateAccessToken(user._id, user.role);
  const newRefreshToken = generateRefreshToken();

  // Replace old refresh token with new one
  user.refreshTokens = user.refreshTokens.filter((t) => t !== refreshToken);
  user.refreshTokens.push(newRefreshToken);
  await user.save();

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

/**
 * Logout
 */
const logout = async (userId, accessToken, refreshToken) => {
  // Blacklist the current access token in Redis (until it expires naturally in 15 min)
  const JWT_EXPIRY_SECONDS = 15 * 60; // 15 minutes
  await redis.set(`blacklist:${accessToken}`, true, JWT_EXPIRY_SECONDS);

  // Remove the refresh token from user's list
  if (refreshToken) {
    await User.findByIdAndUpdate(userId, {
      $pull: { refreshTokens: refreshToken },
    });
  }

  await AuditLog.create({
    userId,
    action: "LOGOUT",
    resource: "/auth/logout",
    statusCode: 200,
  });

  return { message: "Logged out successfully" };
};

/**
 * Forgot password - send OTP
 */
const forgotPassword = async (phone) => {
  const user = await User.findOne({ phone, isActive: true });
  if (!user) {
    // Security: Don't reveal if phone exists or not
    return { message: "If this number is registered, an OTP will be sent." };
  }

  const otp = generateOTP();
  await redis.set(
    `otp:reset:${phone}`,
    { otp, userId: user._id.toString() },
    10 * 60,
  );
  await sendOTP(phone, otp);

  await AuditLog.create({
    userId: user._id,
    action: "OTP_SENT",
    resource: "/auth/forgot-password",
  });

  return { message: "If this number is registered, an OTP will be sent." };
};

/**
 * Reset password
 */
const resetPassword = async ({ phone, otp, newPassword }) => {
  const stored = await redis.get(`otp:reset:${phone}`);

  if (!stored || stored.otp !== otp) {
    throw new AppError("Invalid or expired OTP.", 400, "ERR_AUTH_002");
  }

  const user = await User.findById(stored.userId).select("+passwordHash");
  if (!user) throw new AppError("User not found.", 404, "ERR_NOT_FOUND");

  user.passwordHash = newPassword; // Will be hashed by pre-save hook
  // Invalidate all existing sessions
  user.refreshTokens = [];
  await user.save();

  await redis.del(`otp:reset:${phone}`);

  await AuditLog.create({
    userId: user._id,
    action: "PASSWORD_RESET",
    resource: "/auth/reset-password",
  });

  return {
    message:
      "Password reset successfully. Please login with your new password.",
  };
};

module.exports = {
  register,
  verifyOtp,
  login,
  refreshAccessToken,
  logout,
  forgotPassword,
  resetPassword,
};
