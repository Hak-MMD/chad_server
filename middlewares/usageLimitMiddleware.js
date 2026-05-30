// middlewares/usageLimitMiddleware.js
const UsageStats = require("../models/UsageStats");
const resetUsageStats = require("../utils/resetUsageStats");
const { PLANS } = require("../config/plans");

function usageLimit(options = {}) {
  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const planKey = user.plan || "free";
      const plan = PLANS[planKey];
      if (!plan) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (options?.requiresImage && !plan.allowImages) {
        return res.status(403).json({
          error: "Upgrade required for image generation",
          upgradeRequired: true,
        });
      }

      // Reset stale daily/monthly counters before checking limits
      const stats = await UsageStats.findOne({ userId: user.id });
      if (!stats) {
        return res.status(500).json({ error: "Usage stats not found" });
      }
      await resetUsageStats(stats);

      // Atomic check + reserve a slot — prevents concurrent requests bypassing limits
      const updated = await UsageStats.findOneAndUpdate(
        {
          userId: user.id,
          dailyCount: { $lt: plan.dailyRequests },
          monthlyCount: { $lt: plan.monthlyRequests },
        },
        { $inc: { dailyCount: 1, monthlyCount: 1 } },
        { new: true },
      );

      if (!updated) {
        const current = await UsageStats.findOne({ userId: user.id });
        if (current.dailyCount >= plan.dailyRequests) {
          return res.status(429).json({
            error: "Daily limit reached",
            upgradeRequired: true,
          });
        }
        return res.status(429).json({
          error: "Monthly limit reached",
          upgradeRequired: true,
        });
      }

      req.usageStats = updated;
      req.plan = plan;
      next();
    } catch (err) {
      console.error("Usage limit middleware error:", err);
      return res.status(500).json({ error: "Usage limit check failed" });
    }
  };
}

module.exports = usageLimit;
