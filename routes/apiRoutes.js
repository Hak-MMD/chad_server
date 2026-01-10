const express = require("express");
const {
  message,
  messageErr,
  messageNorm,
} = require("../controllers/apiController");
const protect = require("../middlewares/authMiddleware");
const usageLimit = require("../middlewares/usageLimitMiddleware");

const router = express.Router();

router.post("/message", protect, usageLimit(), message);
// router.post("/message", protect, usageLimit, messageErr);
// router.post("/message", protect, usageLimit(), messageNorm);

module.exports = router;
