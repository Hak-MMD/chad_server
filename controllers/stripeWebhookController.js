const stripe = require("../config/stripe");
const StripeEvent = require("../models/StripeEvent");
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const { PLANS } = require("../config/plans");

const isLive = process.env.STRIPE_MODE === "live";
const webhookSecret = isLive
  ? process.env.STRIPE_WEBHOOK_SECRET_LIVE
  : process.env.STRIPE_WEBHOOK_SECRET_TEST;

// Map Stripe price ID -> internal plan key ("pro" | "enterprise")
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
  const status = subscription.status; // trialing, active, past_due, canceled, unpaid, etc.
  const currentPeriodStart = new Date(subscription.current_period_start * 1000);
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  const cancelAtPeriodEnd = subscription.cancel_at_period_end || false;

  const price = subscription.items?.data?.[0]?.price;
  const priceId = price?.id;

  const planKey = priceId ? mapPriceToPlan(priceId) : null;

  if (!planKey || !["pro", "enterprise"].includes(planKey)) {
    console.warn("Unknown or unsupported plan for price:", priceId);
    return;
  }

  // Find user by stripeCustomerId
  const user = await User.findOne({ stripeCustomerId: stripeCustomerId });
  if (!user) {
    console.warn("No user found for stripeCustomerId:", stripeCustomerId);
    return;
  }

  // Upsert subscription record
  const subscriptionDoc = await Subscription.findOneAndUpdate(
    { stripeSubscriptionId },
    {
      userId: user._id,
      stripeCustomerId,
      stripeSubscriptionId,
      plan: planKey,
      status:
        status === "incomplete" || status === "incomplete_expired"
          ? "canceled"
          : status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
    },
    { upsert: true, new: true },
  );

  // Update user plan based on subscription status
  if (["active", "trialing", "past_due"].includes(status)) {
    user.plan = planKey;
    user.activeSubscriptionId = subscriptionDoc._id;
  } else if (["canceled", "unpaid", "incomplete_expired"].includes(status)) {
    user.plan = "free";
    user.activeSubscriptionId = null;
  }

  await user.save();
}

const handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Idempotency: store event and skip if already processed
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
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        await handleSubscriptionEvent(subscription);
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        // You can add logging or future logic here if needed
        break;
      }

      default:
        // Ignore other events for now
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
