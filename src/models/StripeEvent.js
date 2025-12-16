const mongoose = require("mongoose");

const StripeEventSchema = new mongoose.Schema(
  {
    stripeEventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    payload: { type: Object, required: true },
    processed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const stripeEventModel = mongoose.model("stripe_events", StripeEventSchema);

module.exports = stripeEventModel;
