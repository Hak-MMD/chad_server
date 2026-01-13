const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    name: {
      type: String,
    },

    avatarUrl: {
      type: String,
    },

    passwordHash: {
      type: String, // null if OAuth-only
    },

    authProvider: {
      type: String,
      enum: ["email", "google"],
      required: true,
    },

    plan: {
      type: String,
      enum: ["free", "pro", "enterprise"],
      default: "free",
      index: true,
    },

    role: {
      type: String,
      enum: ["user", "admin", "dev"],
      default: "user",
    },

    status: {
      type: String,
      enum: ["active", "blocked", "deleted"],
      default: "active",
    },

    stripeCustomerId: {
      type: String,
    },

    activeSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "subscriptions",
    },

    lastLoginAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("users", UserSchema);
