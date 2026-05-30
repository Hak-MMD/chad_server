const express = require("express");
const router = express.Router();

const { createCheckoutSession, createPortalSession } = require("../controllers/billingController");
const protect = require("../middlewares/authMiddleware");
const requireEmailVerified = require("../middlewares/requireEmailVerified");

router.post("/create-checkout-session", protect, requireEmailVerified, createCheckoutSession);
router.post("/create-portal-session", protect, requireEmailVerified, createPortalSession);

module.exports = router;
