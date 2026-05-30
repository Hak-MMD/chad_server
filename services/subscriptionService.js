const User = require("../models/User");
const Subscription = require("../models/Subscription");

// Called when Stripe subscription is active/trialing/past_due
async function applyActiveSubscription({
  userId,
  plan,
  interval,
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
      interval,
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

// Admin: manually upgrade a user's plan (bypasses Stripe)
async function upgradeUserPlan({ userId, plan, periodStart, periodEnd }) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const subscription = await Subscription.findOneAndUpdate(
    { userId },
    {
      userId,
      plan,
      status: "active",
      interval: "monthly",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
    { upsert: true, new: true },
  );

  user.plan = plan;
  user.activeSubscriptionId = subscription._id;
  await user.save();

  return { user, subscription };
}

// Admin: manually downgrade a user to free (bypasses Stripe)
async function downgradeUserPlan(userId) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  if (user.activeSubscriptionId) {
    await Subscription.findByIdAndUpdate(user.activeSubscriptionId, {
      status: "canceled",
    });
  }

  user.plan = "free";
  user.activeSubscriptionId = null;
  await user.save();

  return { user };
}

module.exports = {
  applyActiveSubscription,
  applyCanceledSubscription,
  upgradeUserPlan,
  downgradeUserPlan,
};
