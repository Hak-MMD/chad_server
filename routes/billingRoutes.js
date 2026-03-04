const express = require("express");
const router = express.Router();

const {
  createCheckoutSession,
  createPortalSession,
} = require("../controllers/billingController");
const authMiddleware = require("../middlewares/authMiddleware");

// Create Stripe Checkout Session
router.post("/create-checkout-session", authMiddleware, createCheckoutSession);

// Create Stripe Billing Portal Session
router.post("/create-portal-session", authMiddleware, createPortalSession);

module.exports = router;
