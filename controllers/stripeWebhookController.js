const stripe = require("../config/stripe");
const StripeEvent = require("../models/StripeEvent");
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const { PLANS } = require("../config/plans");

const isLive = process.env.STRIPE_MODE === "live";
const webhookSecret = isLive
  ? process.env.STRIPE_WEBHOOK_SECRET_LIVE
  : process.env.STRIPE_WEBHOOK_SECRET_TEST;

function mapPriceToPlan(priceId) {
  for (const [planKey, planConfig] of Object.entries(PLANS)) {
    if (
      planConfig.stripePriceIdMonthly === priceId ||
      planConfig.stripePriceIdYearly === priceId
    ) {
      return planKey;
    }
  }
  return null;
}

async function handleSubscriptionEvent(subscription) {
  const stripeSubscriptionId = subscription.id;
  const stripeCustomerId = subscription.customer;
  const status = subscription.status;
  const currentPeriodStart = new Date(subscription.current_period_start * 1000);
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  const cancelAtPeriodEnd = subscription.cancel_at_period_end || false;

  const price = subscription.items?.data?.[0]?.price;
  const priceId = price?.id;

  const planKey = priceId ? mapPriceToPlan(priceId) : null;
  const intervalRaw = price?.recurring?.interval; // "month" | "year"
  const interval = intervalRaw === "year" ? "yearly" : "monthly";

  if (!planKey || !["basic", "pro", "unlimited"].includes(planKey)) {
    console.warn("Unknown or unsupported plan for price:", priceId);
    return;
  }

  const user = await User.findOne({ stripeCustomerId });
  if (!user) {
    console.warn("No user found for stripeCustomerId:", stripeCustomerId);
    return;
  }

  if (["active", "trialing", "past_due"].includes(status)) {
    await applyActiveSubscription({
      userId: user._id,
      plan: planKey,
      interval,
      stripeCustomerId,
      stripeSubscriptionId,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      status,
    });
  } else {
    await applyCanceledSubscription({
      userId: user._id,
      stripeSubscriptionId,
    });
  }
}

const handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  if (!webhookSecret) {
    console.error("Stripe webhook secret not configured for mode:", isLive ? "live" : "test");
    return res.status(500).send("Webhook configuration error");
  }

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    let existing = await StripeEvent.findOne({ stripeEventId: event.id });
    if (existing && existing.processed) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    if (!existing) {
      existing = await StripeEvent.create({
        stripeEventId: event.id,
        type: event.type,
        payload: event,
        processed: false,
      });
    }

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionEvent(event.data.object);
        break;

      case "invoice.payment_succeeded":
      case "invoice.payment_failed":
        break;

      default:
        break;
    }

    existing.processed = true;
    await existing.save();

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    return res.status(500).send("Webhook handler failed");
  }
};

module.exports = {
  handleStripeWebhook,
};
