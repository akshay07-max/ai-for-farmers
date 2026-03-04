const { z } = require("zod");

// Schema for user registration
const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z
    .string()
    .min(10, "Phone must be at least 10 digits")
    .max(15, "Phone must be at most 15 digits"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  language: z.string().optional(),
});

// Schema for login
const loginSchema = z.object({
  phone: z
    .string()
    .min(10, "Phone must be at least 10 digits")
    .max(15, "Phone must be at most 15 digits"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// Schema for OTP verification after registration
const verifyOtpSchema = z.object({
  phone: z
    .string()
    .min(10, "Phone must be at least 10 digits")
    .max(15, "Phone must be at most 15 digits"),
  otp: z.string().min(4).max(8),
});

// Schema for refreshing access token
const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

// Schema for starting password reset
const forgotPasswordSchema = z.object({
  phone: z
    .string()
    .min(10, "Phone must be at least 10 digits")
    .max(15, "Phone must be at most 15 digits"),
});

// Schema for completing password reset with OTP
const resetPasswordSchema = z.object({
  phone: z
    .string()
    .min(10, "Phone must be at least 10 digits")
    .max(15, "Phone must be at most 15 digits"),
  otp: z.string().min(4).max(8),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

module.exports = {
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};

