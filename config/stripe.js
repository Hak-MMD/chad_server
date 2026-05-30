const Stripe = require("stripe");

const isLive = process.env.STRIPE_MODE === "live";

const secretKey = isLive
  ? process.env.STRIPE_SECRET_KEY_LIVE
  : process.env.STRIPE_SECRET_KEY_TEST;

if (!secretKey) {
  throw new Error(
    `Stripe secret key not configured for mode: ${isLive ? "live" : "test"}`,
  );
}

const stripe = new Stripe(secretKey, {
  apiVersion: "2023-10-16",
});

module.exports = stripe;
