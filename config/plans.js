const PLANS = {
  free: {
    name: "Free",
    dailyRequests: 5,
    monthlyRequests: 100,
    allowImages: true,
    defaultModel: "gpt-4o-mini",
  },

  pro: {
    name: "Pro",
    dailyRequests: 100,
    monthlyRequests: 3000,
    allowImages: true,
    defaultModel: "gpt-4o",
    stripePriceIdMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
    stripePriceIdYearly: process.env.STRIPE_PRICE_PRO_YEARLY,
  },

  enterprise: {
    name: "Enterprise",
    dailyRequests: 1000,
    monthlyRequests: 30000,
    allowImages: true,
    defaultModel: "gpt-4o",
    stripePriceIdMonthly: process.env.STRIPE_PRICE_ENT_MONTHLY,
    stripePriceIdYearly: process.env.STRIPE_PRICE_ENT_YEARLY,
  },
};

module.exports = { PLANS };
