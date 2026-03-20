const {
  upgradeUserPlan,
  downgradeUserPlan,
} = require("../services/subscriptionService");

const upgradeUser = async (req, res) => {
  try {
    const { plan, interval } = req.body;

    if (!["monthly", "yearly"].includes(interval)) {
      return res.status(400).json({ error: "Invalid interval" });
    }

    if (!["basic", "pro", "unlimited"].includes(plan)) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    console.log("Upgrading user:", req.params.id, "to plan:", plan);

    const result = await upgradeUserPlan({
      userId: req.params.id,
      plan,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const downgradeUser = async (req, res) => {
  try {
    const result = await downgradeUserPlan(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { upgradeUser, downgradeUser };
