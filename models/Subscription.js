const mongoose = require("mongoose");

const SubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },

    stripeCustomerId: { type: String, required: true },
    stripeSubscriptionId: { type: String, required: true, unique: true },

    plan: { type: String, enum: ["basic", "pro", "unlimited"], required: true },
    interval: { type: String, enum: ["monthly", "yearly"], required: true },

    status: {
      type: String,
      enum: ["trialing", "active", "past_due", "canceled"],
      required: true,
    },

    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    cancelAtPeriodEnd: Boolean,
  },
  { timestamps: true },
);

module.exports = mongoose.model("subscriptions", SubscriptionSchema);
