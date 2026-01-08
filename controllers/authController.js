const userModel = require("../models/User.js");
const validatePassword = require("../utils/validatePassword.js");
const bcrypt = require("bcryptjs");
const {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  refreshExpiryDate,
} = require("../utils/jwt.js");
const sendEmail = require("../utils/sendEmail.js");
const loadTemplate = require("../utils/loadTemplate.js");
const authSessionModel = require("../models/AuthRefresh.js");
const crypto = require("crypto");
const EmailVerification = require("../models/EmailVerification.js");
// const sendEmail = require("../utils/sendEmail.js"); // Placeholder for email sending utility

const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!validatePassword(password)) {
      return res.status(400).json({
        error: "Password must be 8+ chars, include uppercase and number",
      });
    }

    const existing = await userModel.findOne({ email });
    if (existing)
      return res.status(400).json({ error: "Email already exists" });

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await userModel.create({
      email,
      passwordHash,
      name,
      authProvider: "email",
    });

    // -----------------------------
    // EMAIL VERIFICATION LOGIC
    // -----------------------------
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");

    await EmailVerification.create({
      userId: user._id,
      codeHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    });

    // Load HTML template
    let html = loadTemplate("verification.html");
    // Replace placeholder with actual code
    html = html.replace("{{CODE}}", code);
    // Send email
    await sendEmail(user.email, "ChadAI: Please verify your email!", html);

    res.json({
      message: "Registration successful! Please verify your email.",
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await userModel.findOne({ email });
    console.log("User found:", user);
    if (!user) return res.status(400).json({ error: "Invalid credentials" });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(400).json({ error: "Invalid credentials" });
    console.log(valid);
    const accessToken = generateAccessToken(user);

    console.log("access: ", accessToken);
    const refreshToken = generateRefreshToken();
    const refreshHash = hashToken(refreshToken);
    await authSessionModel.create({
      userId: user._id,
      refreshTokenHash: refreshHash,
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
      expiresAt: refreshExpiryDate(),
      lastUsedAt: new Date(),
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.json({
      accessToken,
      user: { id: user._id, email: user.email, plan: user.plan },
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

const refreshToken = async (req, res) => {
  try {
    const incoming = req.body.refreshToken || req.cookies.refreshToken;
    console.log(132);
    if (!incoming)
      return res.status(401).json({ error: "Missing refresh token" });
    const incomingHash = hashToken(incoming);

    const session = await authSessionModel.findOne({
      refreshTokenHash: incomingHash,
      revokedAt: null,
    });

    if (!session)
      return res.status(401).json({ error: "Invalid refresh token" });

    if (session.expiresAt < new Date()) {
      session.revokedAt = new Date();
      await session.save();
      return res.status(401).json({ error: "Refresh token expired" });
    }

    const user = await userModel.findById(session.userId);
    if (!user) return res.status(401).json({ error: "User not found" });

    // ROTATE TOKEN
    const newRefreshToken = generateRefreshToken();
    const newHash = hashToken(newRefreshToken);

    session.refreshTokenHash = newHash;
    session.expiresAt = refreshExpiryDate();
    session.lastUsedAt = new Date();
    await session.save();

    const accessToken = generateAccessToken(user);

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({ accessToken });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

const logout = async (req, res) => {
  try {
    const incoming = req.cookies.refreshToken || req.body.refreshToken;
    if (incoming) {
      const hash = hashToken(incoming);

      await authSessionModel.updateOne(
        { refreshTokenHash: hash },
        { revokedAt: new Date() }
      );
    }

    res.clearCookie("refreshToken");

    res.json({ message: "Logged out" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

const getCurrentUser = async (req, res) => {
  const user = await userModel.findById(req.user.id);

  res.json({
    id: user._id,
    email: user.email,
    plan: user.plan,
    usage: {
      daily: user.usageSnapshot.dailyRequests,
      monthly: user.usageSnapshot.monthlyRequests,
    },
  });
};

const verifyEmail = async (req, res) => {
  const { email, code } = req.body;

  const user = await userModel.findOne({ email });
  if (!user) return res.status(400).json({ error: "User not found" });

  const record = await EmailVerification.findOne({ userId: user._id });
  if (!record)
    return res.status(400).json({ error: "No verification request" });

  if (record.expiresAt < new Date()) {
    await record.deleteOne();
    return res.status(400).json({ error: "Code expired" });
  }

  const codeHash = crypto.createHash("sha256").update(code).digest("hex");

  if (codeHash !== record.codeHash) {
    return res.status(400).json({ error: "Invalid code" });
  }

  user.emailVerified = true;
  await user.save();
  await record.deleteOne();

  res.json({ message: "Email verified successfully" });
};

const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await userModel.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });

    if (user.emailVerified) {
      return res.status(400).json({ error: "Email already verified" });
    }

    // ⭐ RATE LIMITER HERE
    const lastRecord = await EmailVerification.findOne({
      userId: user._id,
    }).sort({ createdAt: -1 });

    if (lastRecord && Date.now() - lastRecord.createdAt.getTime() < 60 * 1000) {
      return res.status(429).json({
        error: "Please wait before requesting a new code",
      });
    }

    // Delete old codes
    await EmailVerification.deleteMany({ userId: user._id });

    // Generate new code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");

    await EmailVerification.create({
      userId: user._id,
      codeHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    // Load HTML template
    let html = loadTemplate("verification.html");
    // Replace placeholder with actual code
    html = html.replace("{{CODE}}", code);
    // Send email
    await sendEmail(user.email, "ChadAI: Please verify your email!", html);

    res.json({ message: "New verification code sent" });
  } catch (err) {
    console.error("Resend verification error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getCurrentUser,
  verifyEmail,
  resendVerification,
};
