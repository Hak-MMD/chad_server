const mongoose = require("mongoose");

const SettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      unique: true,
    },

    language: { type: String, default: "en" },
    theme: { type: String, enum: ["light", "dark"], default: "light" },
    defaultModel: { type: String, default: "gpt-4o-mini" },

    extension: {
      autoCapture: { type: Boolean, default: true },
      showNotifications: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

const settingsModel = mongoose.model("settings", SettingsSchema);

module.exports = settingsModel;
