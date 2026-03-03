const mongoose = require("mongoose");

const AccountLinkSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },

    provider: {
      type: String,
      enum: ["google"],
      required: true,
    },

    providerAccountId: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    usedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

// Auto-delete expired records
AccountLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("account_links", AccountLinkSchema);
