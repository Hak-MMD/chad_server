const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max requests per window
  message: {
    error: "Too many authentication attempts. Try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = authLimiter;
