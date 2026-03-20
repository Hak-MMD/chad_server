const mongoose = require("mongoose");

const UsageStatsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      unique: true,
      required: true,
      index: true,
    },

    dailyCount: {
      type: Number,
      default: 0,
    },

    monthlyCount: {
      type: Number,
      default: 0,
    },

    dailyResetAt: {
      type: Date,
      required: true,
    },

    monthlyResetAt: {
      type: Date,
      required: true,
    },
    modelTokenMonthly: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("usage_stats", UsageStatsSchema);
