// Central registry for AI model identifiers.
// Plan-specific model lists live in config/plans.js.
// This file owns model names used outside of plan config (e.g. summarization).
const MODELS = {
  SUMMARIZE_MESSAGE: "gpt-5-nano",
  SUMMARIZE_CONVERSATION: "gpt-5-mini",
};

module.exports = { MODELS };
