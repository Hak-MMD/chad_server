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

    source: { type: String, enum: ["extension", "website"], required: true },
    model: { type: String, default: "gpt-4o-mini" },

    isArchived: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const chatModel = mongoose.model("chats", ChatSchema);

module.exports = chatModel;
