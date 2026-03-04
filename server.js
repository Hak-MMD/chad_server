const express = require("express");
const mongoose = require("mongoose"); //v2
const cors = require("cors");

const dotenv = require("dotenv");
const indexRoutes = require("./routes/index"); //v1
const adminRoutes = require("./routes/adminRoutes");
const apiRoutes = require("./routes/apiRoutes"); //v2
const authRoutes = require("./routes/authRoutes"); //v2
const chatRoutes = require("./routes/chatRoutes"); //v2
const waitlistRoutes = require("./routes/waitlistRoutes"); //v1
const billingRoutes = require("./routes/billingRoutes"); // v2
const {
  handleStripeWebhook,
} = require("./controllers/stripeWebhookController"); // v2
const connectDB = require("./config/db");
const cookieParser = require("cookie-parser");
connectDB();

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.set("trust proxy", 1);

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
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

// Stripe webhook MUST use raw body
app.post(
  "/api/v2/billing/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook,
);

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// Routes
app.use("/admin/", adminRoutes);
app.use("/api/v1/", indexRoutes);
app.use("/api/v2/auth/", authRoutes);
app.use("/api/v2/ai/", apiRoutes);
app.use("/api/v2/chat/", chatRoutes);
app.use("/api/v2/billing/", billingRoutes);
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
