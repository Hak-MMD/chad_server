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

    model: { type: String },
    promptTokens: { type: Number },
    completionTokens: { type: Number },
    totalTokens: { type: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const messageModel = mongoose.model("messages", MessageSchema);

module.exports = messageModel;
