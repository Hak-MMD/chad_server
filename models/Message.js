const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "chats",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },

    content: {
      text: { type: String },
      imageUrl: { type: String },
      imageMeta: {
        width: Number,
        height: Number,
        mimeType: String,
      },
    },
    summary: { type: String },

    model: { type: String },
    promptTokens: { type: Number },
    completionTokens: { type: Number },
    totalTokens: { type: Number },

    // Idempotency: clients may send a unique key to prevent duplicate messages on retry
    idempotencyKey: {
      type: String,
      index: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model("messages", MessageSchema);
