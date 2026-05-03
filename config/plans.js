// config/plans.js

const PLANS = {
  free: {
    name: "Free",
    priceUSDMonthly: 0,
    priceUSDYearly: 0,
    dailyRequests: 10,
    monthlyRequests: 40,
    allowImages: true,
    defaultModel: "gpt-5-nano",
    allowedModels: ["gpt-5-nano", "gpt-5-mini"],
    fallbackModel: "gpt-5-nano",
    modelTokenMonthly: {
      "gpt-5-nano": 50000,
      "gpt-5-mini": 8000,
    },
  },

  basic: {
    name: "Basic",
    priceUSDMonthly: 4.25,
    priceUSDYearly: 38.25, // 25% discount
    stripePriceIdMonthly: process.env.STRIPE_PRICE_BASIC_MONTHLY,
    stripePriceIdYearly: process.env.STRIPE_PRICE_BASIC_YEARLY,
    dailyRequests: 50,
    monthlyRequests: 150,
    allowImages: true,
    defaultModel: "gpt-5-mini",
    allowedModels: ["gpt-5-nano", "gpt-5-mini", "gpt-5.4-nano"],
    fallbackModel: "gpt-5-nano",
    modelTokenMonthly: {
      "gpt-5-nano": 400000,
      "gpt-5-mini": 200000,
      "gpt-5.4-nano": 120000,
    },
  },

  pro: {
    name: "Pro",
    priceUSDMonthly: 6.75,
    priceUSDYearly: 60.75, // 25% discount
    stripePriceIdMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
    stripePriceIdYearly: process.env.STRIPE_PRICE_PRO_YEARLY,
    dailyRequests: 100,
    monthlyRequests: 300,
    allowImages: true,
    defaultModel: "gpt-5-mini",
    allowedModels: ["gpt-5-nano", "gpt-5-mini", "gpt-5.4-nano", "gpt-5.4-mini"],
    fallbackModel: "gpt-5-nano",
    modelTokenMonthly: {
      "gpt-5-nano": 800000,
      "gpt-5-mini": 350000,
      "gpt-5.4-nano": 250000,
      "gpt-5.4-mini": 80000,
    },
  },

  unlimited: {
    name: "Unlimited",
    priceUSDMonthly: 17.76,
    priceUSDYearly: 159.84, // 25% discount
    stripePriceIdMonthly: process.env.STRIPE_PRICE_UNLIMITED_MONTHLY,
    stripePriceIdYearly: process.env.STRIPE_PRICE_UNLIMITED_YEARLY,
    dailyRequests: 300,
    monthlyRequests: 1000,
    allowImages: true,
    defaultModel: "gpt-5-mini",
    allowedModels: [
      "gpt-5-nano",
      "gpt-5-mini",
      "gpt-5.4-nano",
      "gpt-5.4-mini",
      "gpt-5.1",
    ],
    fallbackModel: "gpt-5-nano",
    modelTokenMonthly: {
      "gpt-5-nano": 5000000,
      "gpt-5-mini": 1000000,
      "gpt-5.4-nano": 1000000,
      "gpt-5.4-mini": 400000,
      "gpt-5.1": 250000,
    },
  },
};

module.exports = { PLANS };
