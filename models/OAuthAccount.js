const mongoose = require("mongoose");

const OAuthSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    provider: { type: String, enum: ["google"], required: true },
    providerAccountId: { type: String, required: true },

    email: { type: String },
    avatarUrl: { type: String },
  },
  { timestamps: true },
);

OAuthSchema.index({ provider: 1, providerAccountId: 1 }, { unique: true });

const oAuthModel = mongoose.model("oauth_accounts", OAuthSchema);

module.exports = oAuthModel;
