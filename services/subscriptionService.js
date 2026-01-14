const User = require("../models/User");
const subscriptionModel = require("../models/Subscription");

async function upgradeUserPlan({ userId, plan, periodStart, periodEnd }) {
  // 1️⃣ Update user plan
  const user = await User.findByIdAndUpdate(userId, { plan }, { new: true });

  if (!user) {
    throw new Error("User not found");
  }
  console.log("User found: ", user);
  // 2️⃣ Create or update subscription record
  const subscription = await subscriptionModel.findOneAndUpdate(
    { userId },
    {
      userId,
      plan,
      status: "active",
      stripeCustomerId: "", // To be filled with real Stripe customer ID
      stripeSubscriptionId: "", // To be filled with real Stripe subscription ID
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
    { upsert: true, new: true }
  );
  console.log("Subscription updated/created: ", subscription);
  // 3️⃣ Attach active subscription to user
  user.activeSubscriptionId = subscription._id;
  await user.save();

  return { user, subscription };
}

async function downgradeUserPlan(userId) {
  const user = await User.findByIdAndUpdate(userId, { plan: "free" });

  const subscription = await subscriptionModel.findOneAndUpdate(
    { userId },
    { status: "canceled" }
  );
  return { user, subscription };
}

module.exports = { upgradeUserPlan, downgradeUserPlan };
