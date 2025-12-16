const mongoose = require("mongoose");

const UsageSchema = new mongoose.Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    chatId: { type: Schema.Types.ObjectId, ref: "chats" },

    type: { type: String, enum: ["chat", "image", "analysis"], required: true },
    model: { type: String },

    promptTokens: Number,
    completionTokens: Number,
    totalTokens: Number,

    costUSD: Number,
    source: { type: String, enum: ["extension", "website"] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const usageModel = mongoose.model("usage", UsageSchema);

module.exports = usageModel;
