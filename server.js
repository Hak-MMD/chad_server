const express = require("express");
// const mongoose = require("mongoose"); //v2
const cors = require("cors");

const dotenv = require("dotenv");
const indexRoutes = require("./routes/index");
const apiRoutes = require("./routes/apiRouter"); //v2

dotenv.config();

const app = express();
const PORT =
  process.env.NODE_ENV === "production" ? 8080 : process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/api/v1/", indexRoutes);
app.use("/api/v1/ai/", apiRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
