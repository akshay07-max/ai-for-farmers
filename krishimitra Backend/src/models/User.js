// ================================================================
// USER MODEL — MongoDB schema definition
// Think of this as the "blueprint" for what a User document looks like
// ================================================================
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Schema = blueprint for one document in the "users" collection
const userSchema = new mongoose.Schema(
  {
    // ── Basic Info ──────────────────────────────────────────────
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true, // removes extra spaces
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [50, "Name cannot exceed 50 characters"],
    },

    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true, // no two users share same phone
      // Indian mobile numbers start with 6-9 and have 10 digits
      match: [/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"],
    },

    passwordHash: {
      type: String,
      required: true,
      select: false, // IMPORTANT: Never returned in queries by default (security)
    },

    role: {
      type: String,
      enum: ["FARMER", "ADMIN"], // only these two values allowed
      default: "FARMER",
    },

    // ── Verification & Status ───────────────────────────────────
    isVerified: {
      type: Boolean,
      default: false, // set to true after OTP verification
    },
    isActive: {
      type: Boolean,
      default: true, // set to false instead of deleting the account
    },

    // ── Location ────────────────────────────────────────────────
    village: { type: String, trim: true },
    district: { type: String, trim: true },
    state: { type: String, trim: true, default: "Maharashtra" },
    pincode: {
      type: String,
      match: [/^\d{6}$/, "Enter a valid 6-digit pincode"],
    },

    // ── Farming Details ─────────────────────────────────────────
    languagePreference: {
      type: String,
      enum: ["mr", "hi", "en"], // Marathi, Hindi, English
      default: "mr",
    },
    primaryCrops: [{ type: String }], // e.g. ['onion', 'wheat']
    farmSizeAcres: { type: Number, min: 0 },

    // ── Device & Notifications ──────────────────────────────────
    fcmToken: { type: String }, // Firebase token for push notifications

    // Stores all active refresh tokens (one per device/session)
    // Keeping last 5 means a user can be logged in on 5 devices
    refreshTokens: {
      type: [String],
      select: false, // never returned in queries
      default: [],
    },

    // ── Misc ────────────────────────────────────────────────────
    profilePicUrl: { type: String },
    lastLoginAt: { type: Date },
  },
  {
    // Automatically adds `createdAt` and `updatedAt` fields
    timestamps: true,
  },
);

// ── HOOKS (run automatically before/after database operations) ──

/**
 * Before saving a user, hash the password if it was changed.
 * This means: even if someone gains access to your database,
 * they only see the hash, not the real password.
 */
userSchema.pre("save", async function () {
  // Only run if passwordHash field was actually modified
  if (!this.isModified("passwordHash")) return;
  // 12 = "cost factor" — higher = slower to crack (12 is industry standard)
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});


// ── METHODS (functions available on every user document) ──

/**
 * Check if a plain password matches the stored hash
 * Usage: const isValid = await user.isPasswordCorrect('mypassword')
 */
userSchema.methods.isPasswordCorrect = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

/**
 * Return user object without sensitive fields
 * Usage: res.json({ user: user.toSafeObject() })
 */
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.refreshTokens;
  delete obj.__v; // internal Mongoose version key
  return obj;
};

// Create and export the model
// Mongoose will automatically create a "users" collection in MongoDB
module.exports = mongoose.model("User", userSchema);
