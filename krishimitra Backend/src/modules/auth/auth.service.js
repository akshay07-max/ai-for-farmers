// ================================================================
// AUTH SERVICE — All authentication business logic
// ================================================================
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const User = require("../../models/User");
const AuditLog = require("../../models/AuditLog");
const { redis } = require("../../config/redis");
const { AppError } = require("../../middlewares/errorHandler");
const logger = require("../../utils/logger");

// ── Token generators ─────────────────────────────────────────────

/**
 * Creates a short-lived JWT access token (15 minutes by default).
 * Contains userId and role so we don't need to hit the DB on every request.
 */
const generateAccessToken = (userId, role) => {
  return jwt.sign(
    { userId: userId.toString(), role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m" },
  );
};

/**
 * Creates a random UUID as a refresh token.
 * We use UUID (not JWT) because it's easy to revoke from the database.
 */
const generateRefreshToken = () => uuidv4();

// ── OTP helpers ──────────────────────────────────────────────────

/** Generate a random 6-digit OTP */
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/**
 * Send OTP to user's phone.
 *
 * In DEVELOPMENT: Just prints OTP to the terminal (no SMS needed).
 * In PRODUCTION:  You would use Twilio or AWS SNS here.
 */
const sendOTP = async (phone, otp) => {
  if (process.env.NODE_ENV !== "production") {
    logger.info("─────────────────────────────────");
    logger.info(`  📱 OTP for ${phone}: ${otp}`);
    logger.info("  ⚠️  DEV MODE — SMS not sent");
    logger.info("─────────────────────────────────");
    return;
  }

  // ── PRODUCTION: Integrate Twilio here ──
  // Uncomment below and install: npm install twilio
  //
  // const twilio = require('twilio')(
  //   process.env.TWILIO_ACCOUNT_SID,
  //   process.env.TWILIO_AUTH_TOKEN
  // );
  // await twilio.messages.create({
  //   body: `Your KrishiMitra OTP is: ${otp}. It expires in 10 minutes. Do not share it.`,
  //   from: process.env.TWILIO_PHONE_NUMBER,
  //   to:   `+91${phone}`,
  // });
};

// ── Auth operations ──────────────────────────────────────────────

/**
 * REGISTER — Create a new user and send OTP for verification
 */
const register = async (data, meta = {}) => {
  // Check if phone is already taken
  const existing = await User.findOne({ phone: data.phone });
  if (existing) {
    throw new AppError(
      "This phone number is already registered. Please login.",
      409,
      "ERR_AUTH_001",
    );
  }

  // Create the user in MongoDB.
  // Note: we store data.password as passwordHash — the model's pre-save hook
  // will automatically hash it with bcrypt before saving.
  const user = await User.create({
    name: data.name,
    phone: data.phone,
    passwordHash: data.password, // will be hashed automatically
    role: data.role,
    village: data.village,
    district: data.district,
    state: data.state,
    pincode: data.pincode,
    languagePreference: data.languagePreference,
  });

  // Generate OTP and save to Redis with 10-minute expiry
  // Key format: otp:register:9876543210
  const otp = generateOTP();
  const otpKey = `otp:register:${data.phone}`;
  await redis.set(otpKey, { otp, userId: user._id.toString() }, 10 * 60);

  await sendOTP(data.phone, otp);

  // Log this event
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
 * VERIFY OTP — Confirm phone number after registration
 */
const verifyOtp = async (phone, otp) => {
  // Look up the OTP we stored in Redis
  const stored = await redis.get(`otp:register:${phone}`);

  if (!stored) {
    throw new AppError(
      "OTP has expired or was not found. Please register again or request a new OTP.",
      400,
      "ERR_AUTH_002",
    );
  }

  if (stored.otp !== otp) {
    throw new AppError(
      "Incorrect OTP. Please check and try again.",
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

  // Delete the OTP — it should only be usable once
  await redis.del(`otp:register:${phone}`);

  await AuditLog.create({
    userId: user._id,
    action: "OTP_VERIFIED",
    resource: "/auth/verify-otp",
    statusCode: 200,
  });

  return { message: "Phone verified successfully! You can now login." };
};

/**
 * LOGIN — Authenticate and return tokens
 */
const login = async ({ phone, password, fcmToken }, meta = {}) => {
  // Find user — must explicitly select passwordHash (hidden by default)
  const user = await User.findOne({ phone }).select(
    "+passwordHash +refreshTokens",
  );

  // Use a generic error message — don't tell the attacker whether phone or password was wrong
  if (!user || !user.isActive) {
    throw new AppError(
      "Invalid phone number or password.",
      401,
      "ERR_AUTH_003",
    );
  }

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new AppError(
      "Invalid phone number or password.",
      401,
      "ERR_AUTH_003",
    );
  }

  // Block unverified users and resend OTP
  if (!user.isVerified) {
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

  // Store refresh token — keep last 5 (supports 5 devices simultaneously)
  const existingTokens = user.refreshTokens || [];
  user.refreshTokens = [...existingTokens.slice(-4), refreshToken];
  if (fcmToken) user.fcmToken = fcmToken;
  user.lastLoginAt = new Date();
  await user.save();

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
 * REFRESH — Issue new tokens (token rotation for security)
 */
const refreshAccessToken = async (refreshToken) => {
  // Find the user who owns this refresh token
  const user = await User.findOne({ refreshTokens: refreshToken }).select(
    "+refreshTokens",
  );

  if (!user) {
    throw new AppError(
      "Invalid or expired session. Please login again.",
      401,
      "ERR_AUTH_004",
    );
  }

  // Generate brand new tokens
  const newAccessToken = generateAccessToken(user._id, user.role);
  const newRefreshToken = generateRefreshToken();

  // Rotate: remove old token, add new one
  user.refreshTokens = user.refreshTokens
    .filter((t) => t !== refreshToken)
    .concat(newRefreshToken);
  await user.save();

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

/**
 * LOGOUT — Invalidate tokens
 */
const logout = async (userId, accessToken, refreshToken) => {
  // Blacklist the access token in Redis until it would naturally expire (15 min)
  // This prevents it being used even if someone has copied it
  await redis.set(`blacklist:${accessToken}`, 1, 15 * 60);

  // Remove the refresh token from the user's list in MongoDB
  if (refreshToken) {
    await User.findByIdAndUpdate(userId, {
      $pull: { refreshTokens: refreshToken },
    });
  }

  await AuditLog.create({
    userId: userId,
    action: "LOGOUT",
    resource: "/auth/logout",
    statusCode: 200,
  });
};

/**
 * FORGOT PASSWORD — Send OTP to reset password
 */
const forgotPassword = async (phone) => {
  const user = await User.findOne({ phone, isActive: true });

  // Security: always return the same message whether phone exists or not
  // This prevents "phone enumeration" attacks
  if (!user) {
    return { message: "If this number is registered, an OTP has been sent." };
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

  return { message: "If this number is registered, an OTP has been sent." };
};

/**
 * RESET PASSWORD — Verify OTP and update password
 */
const resetPassword = async ({ phone, otp, newPassword }) => {
  const stored = await redis.get(`otp:reset:${phone}`);

  if (!stored || stored.otp !== otp) {
    throw new AppError(
      "Invalid or expired OTP. Please request a new one.",
      400,
      "ERR_AUTH_002",
    );
  }

  const user = await User.findById(stored.userId).select(
    "+passwordHash +refreshTokens",
  );
  if (!user) throw new AppError("User not found.", 404, "ERR_NOT_FOUND");

  // Update password — the pre-save hook will hash it automatically
  user.passwordHash = newPassword;
  // Logout all devices by clearing all refresh tokens
  user.refreshTokens = [];
  await user.save();

  // Delete the used OTP
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
