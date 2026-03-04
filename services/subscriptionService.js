const User = require("../models/User");
const Subscription = require("../models/Subscription");

// Called when Stripe subscription is active/trialing/past_due
async function applyActiveSubscription({
  userId,
  plan,
  stripeCustomerId,
  stripeSubscriptionId,
  currentPeriodStart,
  currentPeriodEnd,
  cancelAtPeriodEnd,
  status,
}) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const subscription = await Subscription.findOneAndUpdate(
    { stripeSubscriptionId },
    {
      userId,
      plan,
      status,
      stripeCustomerId,
      stripeSubscriptionId,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
    },
    { upsert: true, new: true },
  );

  user.plan = plan;
  user.activeSubscriptionId = subscription._id;
  await user.save();

  return { user, subscription };
}

// Called when Stripe subscription is canceled/unpaid/expired
async function applyCanceledSubscription({ userId, stripeSubscriptionId }) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const subscription = await Subscription.findOneAndUpdate(
    { stripeSubscriptionId },
    { status: "canceled" },
    { new: true },
  );

  user.plan = "free";
  user.activeSubscriptionId = null;
  await user.save();

  return { user, subscription };
}

module.exports = {
  applyActiveSubscription,
  applyCanceledSubscription,
};
