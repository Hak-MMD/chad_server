const express = require("express");
const chatController = require("../controllers/chatController");
const protect = require("../middlewares/authMiddleware");
const requireEmailVerified = require("../middlewares/requireEmailVerified");
const { validateCreateChat, validateUpdateChat } = require("../middlewares/validate");

const router = express.Router();

// All chat routes require auth + verified email
router.use(protect, requireEmailVerified);

router.get("/", chatController.listChats);
router.post("/", ...validateCreateChat, chatController.createChat);
router.get("/:id/messages", chatController.getMessages);
router.patch("/:id", ...validateUpdateChat, chatController.updateChat);
router.delete("/:id", chatController.deleteChat);

// Legacy — kept for backward compatibility with the Chrome extension
router.get("/getMessages", chatController.getMessages);

module.exports = router;
