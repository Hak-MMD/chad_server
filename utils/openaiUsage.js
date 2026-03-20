const MODEL_PRICING = {
  "gpt-5.0-nano": {
    prompt: 0.05 / 1_000_000,
    completion: 0.4 / 1_000_000,
  },
  "gpt-5.4-nano": {
    prompt: 0.2 / 1_000_000,
    completion: 1.25 / 1_000_000,
  },
  "gpt-5.0-mini": {
    prompt: 0.25 / 1_000_000,
    completion: 2.0 / 1_000_000,
  },
  "gpt-5.4-mini": {
    prompt: 0.75 / 1_000_000,
    completion: 4.5 / 1_000_000,
  },
  "gpt-5.1": {
    prompt: 1.25 / 1_000_000,
    completion: 10.0 / 1_000_000,
  },
};

function calculateUsage({ model, promptTokens, completionTokens }) {
  const pricing = MODEL_PRICING[model];

  if (!pricing) {
    console.warn("Unknown model for pricing:", model);
    return {
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUSD: 0,
    };
  }

  const costUSD =
    promptTokens * pricing.prompt + completionTokens * pricing.completion;

  return {
    model,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    costUSD,
  };
}

module.exports = { calculateUsage };
