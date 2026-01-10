const MODEL_PRICING = {
  "gpt-4o-mini-2024-07-18": {
    prompt: 0.00015 / 1000,
    completion: 0.0006 / 1000,
  },
};

function calculateUsage({ model, promptTokens, completionTokens }) {
  console.log("Calculating usage for model:", model);
  const pricing = MODEL_PRICING[model];

  const costUSD =
    promptTokens * pricing.prompt + completionTokens * pricing.completion;
  console.log("Calculated usage:");
  return {
    model,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    costUSD,
  };
}

module.exports = { calculateUsage };
