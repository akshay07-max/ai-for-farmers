// ================================================================
// AUTH SERVICE — Updated for Step 3
// Change from Step 1/2: sendOTP now sends real SMS via Twilio
// ================================================================
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const User = require("../../models/User");
const AuditLog = require("../../models/AuditLog");
const { redis } = require("../../config/redis");
const { AppError } = require("../../middlewares/errorHandler");
const notificationService = require("../../services/notificationService");
const logger = require("../../utils/logger");

// ── Token generators ──────────────────────────────────────────────────────────
const generateAccessToken = (userId, role) => {
  return jwt.sign(
    { userId: userId.toString(), role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m" },
  );
};

const generateRefreshToken = () => uuidv4();

// ── OTP helpers ───────────────────────────────────────────────────────────────
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/**
 * sendOTP — NOW SENDS REAL SMS via Twilio + notificationService
 * In dev mode: also prints to terminal as backup
 * In prod mode: sends SMS only via Twilio
 */
const sendOTP = async (phone, otp, userId = null) => {
  await notificationService.sendOTPNotification(phone, otp, userId);
};

// ── Auth operations ───────────────────────────────────────────────────────────

const register = async (data, meta = {}) => {
  const existing = await User.findOne({ phone: data.phone });
  if (existing) {
    throw new AppError(
      "This phone number is already registered. Please login.",
      409,
      "ERR_AUTH_001",
    );
  }

  const user = await User.create({
    name: data.name,
    phone: data.phone,
    passwordHash: data.password,
    role: data.role || "FARMER",
    village: data.village,
    district: data.district,
    state: data.state,
    pincode: data.pincode,
    languagePreference: data.languagePreference || "mr",
  });

  const otp = generateOTP();
  const otpKey = `otp:register:${data.phone}`;
  await redis.set(otpKey, { otp, userId: user._id.toString() }, 10 * 60);

  // Send real SMS + push (if FCM token provided)
  await sendOTP(data.phone, otp, user._id);

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

const verifyOtp = async (phone, otp) => {
  const stored = await redis.get(`otp:register:${phone}`);

  if (!stored) {
    throw new AppError(
      "OTP has expired (10 minutes). Please register again.",
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

  const user = await User.findByIdAndUpdate(
    stored.userId,
    { isVerified: true },
    { new: true },
  );

  await redis.del(`otp:register:${phone}`);

  await AuditLog.create({
    userId: user._id,
    action: "OTP_VERIFIED",
    resource: "/auth/verify-otp",
    statusCode: 200,
  });

  return { message: "Phone verified successfully! You can now login." };
};

const login = async ({ phone, password, fcmToken }, meta = {}) => {
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

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new AppError(
      "Invalid phone number or password.",
      401,
      "ERR_AUTH_003",
    );
  }

  if (!user.isVerified) {
    const otp = generateOTP();
    await redis.set(
      `otp:register:${phone}`,
      { otp, userId: user._id.toString() },
      10 * 60,
    );
    await sendOTP(phone, otp, user._id);
    throw new AppError(
      "Phone not verified. A new OTP has been sent to your number.",
      403,
      "ERR_AUTH_006",
    );
  }

  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken();

  const existing = user.refreshTokens || [];
  user.refreshTokens = [...existing.slice(-4), refreshToken];
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

const refreshAccessToken = async (refreshToken) => {
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

  const newAccessToken = generateAccessToken(user._id, user.role);
  const newRefreshToken = generateRefreshToken();

  user.refreshTokens = user.refreshTokens
    .filter((t) => t !== refreshToken)
    .concat(newRefreshToken);
  await user.save();

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

const logout = async (userId, accessToken, refreshToken) => {
  await redis.set(`blacklist:${accessToken}`, 1, 15 * 60);

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

const forgotPassword = async (phone) => {
  const user = await User.findOne({ phone, isActive: true });

  if (!user) {
    return { message: "If this number is registered, an OTP has been sent." };
  }

  const otp = generateOTP();
  await redis.set(
    `otp:reset:${phone}`,
    { otp, userId: user._id.toString() },
    10 * 60,
  );
  await sendOTP(phone, otp, user._id);

  await AuditLog.create({
    userId: user._id,
    action: "OTP_SENT",
    resource: "/auth/forgot-password",
  });

  return { message: "If this number is registered, an OTP has been sent." };
};

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

  user.passwordHash = newPassword;
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
