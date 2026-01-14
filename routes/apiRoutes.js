const express = require("express");
const apiController = require("../controllers/apiController");
const protect = require("../middlewares/authMiddleware");
const usageLimit = require("../middlewares/usageLimitMiddleware");

const router = express.Router();

router.post("/message", protect, usageLimit(), apiController.message);
// router.post("/message", protect, usageLimit(), apiController.messageErr);
// router.post("/message", protect, usageLimit(), apiController.messageNorm);

module.exports = router;
