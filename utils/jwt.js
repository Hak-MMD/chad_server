// utils/jwt.js
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const ACCESS_TOKEN_EXPIRES = "15m";
const REFRESH_TOKEN_EXPIRES_DAYS = 30;

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      plan: user.plan,
      role: user.role,
      emailVerified: user.emailVerified || false,
    },
    process.env.ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES }
  );
};

const generateRefreshToken = () => {
  return crypto.randomBytes(40).toString("hex");
};

const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const refreshExpiryDate = () => {
  return new Date(
    Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000
  );
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  refreshExpiryDate,
};
