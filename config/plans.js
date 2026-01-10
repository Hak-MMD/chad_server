const PLANS = {
  free: {
    name: "Free",
    dailyRequests: 5,
    monthlyRequests: 100,
    allowImages: true,
  },
  pro: {
    name: "Pro",
    dailyRequests: 100,
    monthlyRequests: 3000,
    allowImages: true,
  },
};

module.exports = { PLANS };
