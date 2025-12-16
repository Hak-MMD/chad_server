const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    emailVerified: { type: Boolean, default: false },
    name: { type: String },
    avatarUrl: { type: String },

    passwordHash: { type: String }, // null if OAuth-only
    authProvider: { type: String, enum: ["email", "google"], required: true },

    plan: {
      type: String,
      enum: ["free", "pro", "enterprise"],
      default: "free",
    },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    status: {
      type: String,
      enum: ["active", "blocked", "deleted"],
      default: "active",
    },

    limits: {
      requestsPerDay: { type: Number, default: 20 },
      requestsPerMonth: { type: Number, default: 300 },
    },

    usageSnapshot: {
      dailyRequests: { type: Number, default: 0 },
      monthlyRequests: { type: Number, default: 0 },
      lastResetAt: { type: Date },
    },

    stripeCustomerId: { type: String },
    activeSubscriptionId: { type: Schema.Types.ObjectId, ref: "subscriptions" },

    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

const userModel = mongoose.model("users", UserSchema);

module.exports = userModel;
