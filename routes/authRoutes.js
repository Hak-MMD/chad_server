const express = require("express");
const authController = require("../controllers/authController.js");
const protect = require("../middlewares/authMiddleware.js");

const router = express.Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/refresh", authController.refreshToken);
router.post("/logout", authController.logout);
router.get("/me", protect, authController.getCurrentUser);
router.post("/verify-email", authController.verifyEmail);
router.post("/resend-verification", authController.resendVerification);

module.exports = router;
