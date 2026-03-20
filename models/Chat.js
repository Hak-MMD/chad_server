const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },

    title: { type: String },
    type: { type: String, enum: ["text", "image", "mixed"], default: "text" },

    source: {
      type: String,
      enum: ["extension", "website"],
      required: true,
    },
    conversationSummary: { type: String, default: "" },
    messageCount: { type: Number, default: 0 },
    lastSummaryAt: { type: Number, default: 0 },

    model: { type: String, default: "gpt-5-nano" },

    isArchived: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// ChatSchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.model("chats", ChatSchema);
