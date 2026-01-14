const express = require("express");
const waitlistController = require("../controllers/waitlistController");
// import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/getWaitlist", waitlistController.display);
router.post("/addToWaitlist", waitlistController.addToWaitlist);

module.exports = router;
