const mongoose = require("mongoose");
const crypto = require("crypto");

const EmailVerificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
    required: true,
  },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});

module.exports = mongoose.model("email_verifications", EmailVerificationSchema);
