const express = require("express");
const { addToWaitlist, display } = require("../controllers/waitlistController");
// import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/getWaitlist", display);
router.post("/addToWaitlist", addToWaitlist);

module.exports = router;
