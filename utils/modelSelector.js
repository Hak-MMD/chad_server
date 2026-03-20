// utils/modelSelector.js
const { PLANS } = require("../config/plans");

function getModelUsageFor(stats, model) {
  if (!stats) return 0;
  const raw = stats.modelTokenMonthly || {};
  return raw[model] || 0;
}

function selectModelForRequest({ user, requestedModel, usageStats }) {
  const planKey = user.plan || "free";
  const plan = PLANS[planKey];

  const allowed = plan.allowedModels || [plan.defaultModel];
  const fallback = plan.fallbackModel || plan.defaultModel;

  let model = requestedModel || plan.defaultModel;

  if (!allowed.includes(model)) {
    model = plan.defaultModel;
  }

  const limits = plan.modelTokenMonthly || {};
  const limitForModel = limits[model];

  if (!limitForModel) {
    return { model, downgraded: false, blocked: false };
  }

  const used = getModelUsageFor(usageStats, model);

  if (used >= limitForModel) {
    if (model === fallback) {
      return { model, downgraded: false, blocked: true };
    }

    const fallbackLimit = limits[fallback];
    const fallbackUsed = getModelUsageFor(usageStats, fallback);

    if (fallbackLimit && fallbackUsed >= fallbackLimit) {
      return { model, downgraded: false, blocked: true };
    }

    return { model: fallback, downgraded: true, blocked: false };
  }

  return { model, downgraded: false, blocked: false };
}

module.exports = { selectModelForRequest };
