const express = require("express");
const authController = require("../controllers/authController.js");
const protect = require("../middlewares/authMiddleware.js");
const authLimiter = require("../middlewares/rateLimitAuth");

const router = express.Router();

//app auth
router.post("/register", authLimiter, authController.register);
router.post("/login", authLimiter, authController.login);
router.post("/refresh", authLimiter, authController.refreshToken);
router.post("/logout", authController.logout);
router.get("/me", protect, authController.getCurrentUser);
router.post("/verify-email", authController.verifyEmail);
router.post("/resend-verification", authController.resendVerification);

//sessions
router.get("/sessions", protect, authController.getSessions);
router.delete("/sessions/:id", protect, authController.revokeSession);

//google auth
router.get("/google", authController.googleAuthStart);
router.get("/google/callback", authController.googleAuthCallback);

module.exports = router;
