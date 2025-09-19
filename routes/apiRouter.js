const express = require("express");
const { message } = require("../controllers/apiController");
// import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/message", message);

module.exports = router;
