const express = require("express");
const rateLimit = require("express-rate-limit");
const apiController = require("../controllers/apiController");
const protect = require("../middlewares/authMiddleware");
const requireEmailVerified = require("../middlewares/requireEmailVerified");
const usageLimit = require("../middlewares/usageLimitMiddleware");
const { validateMessage } = require("../middlewares/validate");

const router = express.Router();

// Per-user throttle — sits before usageLimit so rate-limited requests don't consume a quota slot
const aiMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user.id.toString(),
  message: { error: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  "/message",
  protect,
  requireEmailVerified,
  aiMessageLimiter,
  ...validateMessage,
  usageLimit(),
  apiController.message,
);

module.exports = router;
