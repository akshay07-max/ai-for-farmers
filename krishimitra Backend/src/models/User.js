// ============================================================
// USER MODEL - MongoDB Schema
// ============================================================
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      match: [
        /^[6-9]\d{9}$/,
        "Please enter a valid 10-digit Indian mobile number",
      ],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // Never return password in queries
    },
    role: {
      type: String,
      enum: ["FARMER", "ADMIN"],
      default: "FARMER",
    },
    isVerified: {
      type: Boolean,
      default: false, // Becomes true after OTP verification
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // Location Details
    village: { type: String, trim: true },
    district: { type: String, trim: true },
    state: { type: String, trim: true, default: "Maharashtra" },
    pincode: {
      type: String,
      match: [/^\d{6}$/, "Enter valid 6-digit pincode"],
    },

    // Farming Details
    languagePreference: {
      type: String,
      enum: ["mr", "hi", "en"],
      default: "mr", // Marathi by default
    },
    primaryCrops: [{ type: String }],
    farmSizeAcres: { type: Number, min: 0 },

    // Device & Session
    fcmToken: { type: String }, // Firebase push notification token
    refreshTokens: [{ type: String }], // Active refresh tokens (supports multi-device)

    // Profile
    profilePicUrl: { type: String },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  },
);

// ---- METHODS ----

// Hash password before saving
userSchema.pre("save", async function (next) {
  // Only hash if password was changed
  if (!this.isModified("passwordHash")) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

// Method to check password
userSchema.methods.isPasswordCorrect = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

// Method to get safe user object (without sensitive fields)
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.refreshTokens;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
