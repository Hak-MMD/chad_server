const express = require("express");
const mongoose = require("mongoose"); //v2
const cors = require("cors");

const dotenv = require("dotenv");
const indexRoutes = require("./routes/index");
const apiRoutes = require("./routes/apiRoutes"); //v2
const waitlistRoutes = require("./routes/waitlistRoutes"); //v2
const connectDB = require("./config/db");

connectDB();

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = [
  "https://chad-ai-nd2k.onrender.com", // your deployed React site
  "chrome-extension://kolefjoacfickglplddbbbahmmjlokop", // your Chrome extension
  "chrome-extension://ickgehmenchgiejcekmkhncbjcbngbdh", // your Chrome extension
  "http://localhost:3000", // keep for local React dev
  "http://localhost:3001", // keep for local server testing
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // allow cookies/authorization headers if needed
  })
);

app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/api/v1/", indexRoutes);
app.use("/api/v1/ai/", apiRoutes);
app.use("/api/v1/web/", waitlistRoutes);

const start = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on ${PORT}`);
    });
  } catch (error) {
    console.log("Server error", error.message);
  }
};

start();
// Start server
