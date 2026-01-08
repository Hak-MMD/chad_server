const mongoose = require("mongoose");

const AuditLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "users" },
    action: { type: String, required: true },
    source: { type: String, enum: ["extension", "website", "system"] },
    metadata: { type: Object },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const auditLogModel = mongoose.model("audit_logs", AuditLogSchema);

module.exports = auditLogModel;
