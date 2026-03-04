const Stripe = require("stripe");

const isLive = process.env.STRIPE_MODE === "live";

const stripe = new Stripe(
  isLive
    ? process.env.STRIPE_SECRET_KEY_LIVE
    : process.env.STRIPE_SECRET_KEY_TEST,
  {
    apiVersion: "2023-10-16",
  },
);

module.exports = stripe;
