const stripe = require("../config/stripe");
const User = require("../models/User");
const { PLANS } = require("../config/plans");

const FRONTEND_URL =
  process.env.NODE_ENV === "production"
    ? "https://chad-ai-nd2k.onrender.com"
    : "http://localhost:3000";

// Ensure Stripe customer exists or create one
async function getOrCreateStripeCustomer(user) {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { userId: user._id.toString() },
  });

  user.stripeCustomerId = customer.id;
  await user.save();

  return customer.id;
}

// Create Checkout Session
const createCheckoutSession = async (req, res) => {
  try {
    const { plan, interval } = req.body;

    if (!["pro", "enterprise"].includes(plan)) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    if (!["monthly", "yearly"].includes(interval)) {
      return res.status(400).json({ error: "Invalid interval" });
    }

    const priceId =
      interval === "monthly"
        ? PLANS[plan].stripePriceIdMonthly
        : PLANS[plan].stripePriceIdYearly;

    if (!priceId) {
      return res.status(500).json({ error: "Stripe price ID missing" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const stripeCustomerId = await getOrCreateStripeCustomer(user);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${FRONTEND_URL}/billing/success`,
      cancel_url: `${FRONTEND_URL}/billing/cancel`,
      metadata: {
        userId: user._id.toString(),
        plan,
        interval,
      },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error("Checkout session error:", err);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
};

// Create Billing Portal Session
const createPortalSession = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const stripeCustomerId = await getOrCreateStripeCustomer(user);

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${FRONTEND_URL}/account/billing`,
    });

    return res.json({ url: portalSession.url });
  } catch (err) {
    console.error("Portal session error:", err);
    return res.status(500).json({ error: "Failed to create portal session" });
  }
};

module.exports = {
  createCheckoutSession,
  createPortalSession,
};
