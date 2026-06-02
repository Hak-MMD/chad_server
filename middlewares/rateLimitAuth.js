const rateLimit = require("express-rate-limit");

const skipInTest = () => process.env.NODE_ENV === "test";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skip: skipInTest,
  message: {
    error: "Too many authentication attempts. Try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const verifyEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window per IP
  skip: skipInTest,
  message: {
    error: "Too many verification attempts. Try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, verifyEmailLimiter };
