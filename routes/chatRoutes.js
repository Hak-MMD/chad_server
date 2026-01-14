const express = require("express");
const chatController = require("../controllers/chatController");
const protect = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/getMessages", protect, chatController.getMessages);

module.exports = router;
