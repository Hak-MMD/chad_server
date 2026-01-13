const express = require("express");

const adminController = require("../controllers/adminController");
const protect = require("../middlewares/authMiddleware");
const admin = require("../middlewares/adminMiddleware");

const router = express.Router();

router.post("/users/:id/upgrade", protect, admin, adminController.upgradeUser);
router.post(
  "/users/:id/downgrade",
  protect,
  admin,
  adminController.downgradeUser
); // works but need to delete subscription model or properly update the date and time of the end of the subscription.
module.exports = router;
