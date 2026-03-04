const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true }, // e.g. AUTH_REGISTER, AUTH_LOGIN
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    phone: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AuditLog", auditLogSchema);

