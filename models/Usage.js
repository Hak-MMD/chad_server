const mongoose = require("mongoose");

const UsageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },

    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "chats",
      index: true,
    },

    type: {
      type: String,
      enum: ["chat", "image", "analysis"],
      required: true,
      index: true,
    },

    model: {
      type: String,
      index: true,
    },

    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },

    costUSD: { type: Number, default: 0 },

    source: {
      type: String,
      enum: ["extension", "website"],
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

module.exports = mongoose.model("usage", UsageSchema);
