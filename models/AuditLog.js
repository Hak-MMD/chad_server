const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    action: { type: String, required: true },
    source: { type: String, enum: ["extension", "website", "system"] },
    metadata: { type: Object },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model("audit_logs", AuditLogSchema);
