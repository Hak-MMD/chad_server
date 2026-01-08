const express = require("express");
const {
  message,
  messageErr,
  messageNorm,
} = require("../controllers/apiController");
// import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

// router.post("/message", message);
// router.post("/message", messageErr);
router.post("/message", messageNorm);

module.exports = router;
