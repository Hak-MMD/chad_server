const userModel = require("../models/User.js");
const chatModel = require("../models/Chat.js");
const authSessionModel = require("../models/AuthRefresh.js");
const UsageStats = require("../models/UsageStats.js");
const EmailVerification = require("../models/EmailVerification.js");
const oauthModel = require("../models/OAuthAccount.js");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  refreshExpiryDate,
} = require("../utils/jwt.js");
const sendEmail = require("../utils/sendEmail.js");
const loadTemplate = require("../utils/loadTemplate.js");
const validatePassword = require("../utils/validatePassword.js");
const { nextDay, nextMonth } = require("../utils/dateHelpers");
const { PLANS } = require("../config/plans.js");

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

    await chatModel.create({
      userId: user._id,
      source: "extension",
      title: "New chat",
      type: "mixed",
    });
    await UsageStats.create({
      userId: user._id,
      dailyResetAt: nextDay(),
      monthlyResetAt: nextMonth(),
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

    if (user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(423).json({
        error: "Account temporarily locked due to too many failed attempts",
      });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
      user.loginAttempts += 1;

      if (user.loginAttempts >= 10) {
        user.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 min
        user.loginAttempts = 0;
      }

      await user.save();

      return res.status(400).json({ error: "Invalid credentials" });
    }
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
    // Reset login attempts on successful login
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();

    await user.save();

    res.json({
      accessToken,
      user: {
        id: user._id,
        email: user.email,
        plan: user.plan,
        role: user.role,
      },
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
        { revokedAt: new Date() },
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
  // const stats = await UsageStats.findOne({ user: req.user.id });
  // if (!stats) {
  let stats = { dailyCount: 0, monthlyCount: 0 };
  // }
  res.json({
    user,
    usage: {
      dailyUsed: stats?.dailyCount,
      dailyLimit: PLANS[user.plan].dailyRequests,
      monthlyUsed: stats.monthlyCount,
      monthlyLimit: PLANS[user.plan].monthlyRequests,
    },
  });
  // res.json({
  //   id: user._id,
  //   email: user.email,
  //   plan: user.plan,

  // });
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

//sessions controllers
const getSessions = async (req, res) => {
  const sessions = await authSessionModel
    .find({ userId: req.user.id, revokedAt: null })
    .sort({ createdAt: -1 });

  res.json(sessions);
};

const revokeSession = async (req, res) => {
  const session = await authSessionModel.findOne({
    _id: req.params.id,
    userId: req.user.id,
  });

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  session.revokedAt = new Date();
  await session.save();

  res.json({ message: "Session revoked" });
};

///* GOOGLE AUTH PLACEHOLDERS - IMPLEMENTATION IN PROGRESS *///

const googleAuthStart = async (req, res) => {
  const state = crypto.randomBytes(32).toString("hex");

  res.cookie("oauth_state", state, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const googleAuthURL = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return res.redirect(googleAuthURL);
};

const googleAuthCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    const storedState = req.cookies.oauth_state;

    if (!state || state !== storedState) {
      return res.status(400).json({ error: "Invalid OAuth state" });
    }

    res.clearCookie("oauth_state");

    if (!code) {
      return res.status(400).json({ error: "Missing Google auth code" });
    }

    // 1 Exchange code for tokens
    const tokenResponse = await axios.post(
      "https://oauth2.googleapis.com/token",
      {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const { access_token, id_token } = tokenResponse.data;

    // 2 Get user profile from Google
    const googleUser = await axios.get(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      },
    );

    const { sub, email, name, picture } = googleUser.data;

    // sub = google user ID
    const providerAccountId = sub;

    // 3 Check if OAuth account already exists
    let oauthAccount = await oauthModel.findOne({
      provider: "google",
      providerAccountId,
    });

    let user;

    if (oauthAccount) {
      // Existing OAuth user → login
      user = await userModel.findById(oauthAccount.userId);
    } else {
      // 4 Check if user with this email already exists
      user = await userModel.findOne({ email });

      if (!user) {
        // create new user (google signup)

        user = await userModel.create({
          email,
          name,
          avatarUrl: picture,
          authProvider: "google",
          emailVerified: true,
        });

        await chatModel.create({
          userId: user._id,
          source: "extension",
          title: "New chat",
          type: "mixed",
        });

        await UsageStats.create({
          userId: user._id,
          dailyResetAt: nextDay(),
          monthlyResetAt: nextMonth(),
        });
      } else {
        // EMAIL ACCOUNT EXISTS

        if (user.authProvider === "email") {
          // SECURITY RULE:
          // Do not auto-link Google accounts to email accounts

          return res.status(400).json({
            error:
              "An account with this email already exists. Please login using email.",
          });
        }
      }

      // 6 Link OAuth account
      await oauthModel.create({
        userId: user._id,
        provider: "google",
        providerAccountId,
        email,
        avatarUrl: picture,
      });
    }

    // 7 Update login timestamp
    user.lastLoginAt = new Date();
    await user.save();

    // 8 Generate tokens
    const accessToken = generateAccessToken(user);
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

    // 9 Set refresh cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: false, // change to true in production
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    // 10 Redirect to frontend with access token
    return res.redirect(
      `http://localhost:3000/oauth-success?token=${accessToken}`,
    );
  } catch (error) {
    console.error("Google OAuth Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Google authentication failed" });
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
  googleAuthStart,
  googleAuthCallback,
  getSessions,
  revokeSession,
};
