const mongoose = require("mongoose");

const AuthSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },

    refreshTokenHash: { type: String, required: true },
    userAgent: { type: String },
    ipAddress: { type: String },

    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    lastUsedAt: { type: Date },
  },
  { timestamps: true }
);

const authSessionModel = mongoose.model("auth_sessions", AuthSessionSchema);

module.exports = authSessionModel;
