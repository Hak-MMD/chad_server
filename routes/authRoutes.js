const express = require("express");
const authController = require("../controllers/authController.js");
const protect = require("../middlewares/authMiddleware.js");
const { authLimiter, verifyEmailLimiter } = require("../middlewares/rateLimitAuth");
const {
  validateRegister,
  validateLogin,
  validateVerifyEmail,
} = require("../middlewares/validate");

const router = express.Router();

router.post("/register", authLimiter, ...validateRegister, authController.register);
router.post("/login", authLimiter, ...validateLogin, authController.login);
router.post("/refresh", authLimiter, authController.refreshToken);
router.post("/logout", authController.logout);
router.get("/me", protect, authController.getCurrentUser);
router.post("/verify-email", verifyEmailLimiter, ...validateVerifyEmail, authController.verifyEmail);
router.post("/resend-verification", authController.resendVerification);

router.get("/sessions", protect, authController.getSessions);
router.delete("/sessions/:id", protect, authController.revokeSession);

router.get("/google", authController.googleAuthStart);
router.get("/google/callback", authController.googleAuthCallback);
router.post("/google/link-confirm", authController.confirmGoogleLink);

module.exports = router;
