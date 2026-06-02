const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");

dotenv.config();

const indexRoutes = require("./routes/index");
const adminRoutes = require("./routes/adminRoutes");
const apiRoutes = require("./routes/apiRoutes");
const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");
const waitlistRoutes = require("./routes/waitlistRoutes");
const billingRoutes = require("./routes/billingRoutes");
const { handleStripeWebhook } = require("./controllers/stripeWebhookController");
const connectDB = require("./config/db");
const logger = require("./utils/logger");

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === "production";

app.set("trust proxy", 1);

// HTTP request logging (suppressed in test environment)
if (process.env.NODE_ENV !== "test") {
  app.use(morgan(isProd ? "combined" : "dev"));
}

// CORS
const defaultOrigins = [
  "https://chad-ai-nd2k.onrender.com",
  "chrome-extension://kolefjoacfickglplddbbbahmmjlokop",
  "chrome-extension://ickgehmenchgiejcekmkhncbjcbngbdh",
  "http://localhost:3000",
  "http://localhost:3001",
];
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : defaultOrigins;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

// Stripe webhook MUST use raw body and be registered before express.json()
app.post(
  "/api/v2/billing/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook,
);

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// Health check — used by hosting platforms to verify the app is alive
app.get("/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbHealthy = dbState === 1;
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? "ok" : "degraded",
    db: dbHealthy ? "connected" : "disconnected",
    ts: new Date().toISOString(),
  });
});

// Routes
app.use("/admin/", adminRoutes);
app.use("/api/v1/", indexRoutes);
app.use("/api/v2/auth/", authRoutes);
app.use("/api/v2/ai/", apiRoutes);
app.use("/api/v2/chat/", chatRoutes);
app.use("/api/v2/billing/", billingRoutes);
app.use("/api/v1/web/", waitlistRoutes);

// Global error handler — must be the last middleware registered
app.use((err, req, res, next) => {
  logger.error("Unhandled error", { message: err.message, stack: err.stack, url: req.url });
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: isProd ? "Internal server error" : err.message,
  });
});

const start = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`, { env: process.env.NODE_ENV });
    });
  } catch (error) {
    logger.error("Server failed to start", { message: error.message });
    process.exit(1);
  }
};

if (require.main === module) start();

module.exports = app;
