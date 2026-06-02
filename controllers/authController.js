const userModel = require("../models/User.js");
const chatModel = require("../models/Chat.js");
const authSessionModel = require("../models/AuthRefresh.js");
const UsageStats = require("../models/UsageStats.js");
const EmailVerification = require("../models/EmailVerification.js");
const oauthModel = require("../models/OAuthAccount.js");
const AccountLink = require("../models/AccountLink.js");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  refreshExpiryDate,
} = require("../utils/jwt.js");
const AuditLog = require("../models/AuditLog.js");
const sendEmail = require("../utils/sendEmail.js");
const loadTemplate = require("../utils/loadTemplate.js");
const validatePassword = require("../utils/validatePassword.js");
const { nextDay, nextMonth } = require("../utils/dateHelpers");
const { PLANS } = require("../config/plans.js");
const isProd = process.env.NODE_ENV === "production";

const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!validatePassword(password)) {
      return res.status(400).json({
        error: "Password must be 8+ chars, include uppercase and number",
      });
    }

    const existing = await userModel.findOne({ email });
    if (existing) {
      if (existing.authProvider === "email") {
        return res.status(400).json({ error: "Email already exists" });
      }

      // existing.authProvider === "google"
      return res.status(400).json({
        error:
          "This email is already used with Google login. Please sign in with Google.",
      });
    }

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

    AuditLog.create({ userId: user._id, action: "register", source: "website" }).catch(console.error);

    // EMAIL VERIFICATION LOGIC
    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");

    await EmailVerification.create({
      userId: user._id,
      codeHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    let html = loadTemplate("verification.html");
    html = html.replace("{{CODE}}", code);
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
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    if (user.authProvider === "google") {
      return res.status(400).json({
        error: "This account uses Google login. Please sign in with Google.",
      });
    }

    if (user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(423).json({
        error: "Account temporarily locked due to too many failed attempts",
      });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
      user.loginAttempts += 1;

      if (user.loginAttempts >= 10) {
        user.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
        user.loginAttempts = 0;
        AuditLog.create({ userId: user._id, action: "login_locked", source: "website", metadata: { ip: req.ip } }).catch(console.error);
      }

      await user.save();

      return res.status(400).json({ error: "Invalid credentials" });
    }

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

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    AuditLog.create({ userId: user._id, action: "login", source: "website", metadata: { ip: req.ip } }).catch(console.error);

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
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const refreshToken = async (req, res) => {
  try {
    const incoming = req.body?.refreshToken || req.cookies.refreshToken;
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
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({ accessToken });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

const logout = async (req, res) => {
  try {
    const incoming = req.cookies.refreshToken || req.body?.refreshToken;
    if (incoming) {
      const hash = hashToken(incoming);

      const session = await authSessionModel.findOneAndUpdate(
        { refreshTokenHash: hash },
        { revokedAt: new Date() },
        { new: false },
      );

      if (session?.userId) {
        AuditLog.create({ userId: session.userId, action: "logout", source: "website" }).catch(console.error);
      }
    }

    res.clearCookie("refreshToken");
    res.json({ message: "Logged out" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const user = await userModel.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const stats = await UsageStats.findOne({ userId: req.user.id });
    const plan = PLANS[user.plan] || PLANS.free;

    res.json({
      user,
      usage: {
        dailyUsed: stats?.dailyCount ?? 0,
        dailyLimit: plan.dailyRequests,
        monthlyUsed: stats?.monthlyCount ?? 0,
        monthlyLimit: plan.monthlyRequests,
      },
    });
  } catch (err) {
    console.error("getCurrentUser error:", err);
    res.status(500).json({ error: "Server error" });
  }
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

  AuditLog.create({ userId: user._id, action: "email_verified", source: "website" }).catch(console.error);

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
    const code = crypto.randomInt(100000, 1000000).toString();
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
    secure: isProd,
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

    const { access_token } = tokenResponse.data;

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
    const providerAccountId = sub;

    // 3 Check if OAuth account already exists
    let oauthAccount = await oauthModel.findOne({
      provider: "google",
      providerAccountId,
    });

    let user;

    if (oauthAccount) {
      // Existing Google user → login
      user = await userModel.findById(oauthAccount.userId);
    } else {
      // No OAuth record → check if user with this email exists
      user = await userModel.findOne({ email });

      if (!user) {
        // Create new Google user
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

        await oauthModel.create({
          userId: user._id,
          provider: "google",
          providerAccountId,
          email,
          avatarUrl: picture,
        });

        AuditLog.create({ userId: user._id, action: "google_signup", source: "website" }).catch(console.error);
      } else {
        // Email user exists → start linking flow
        if (user.authProvider === "email") {
          const rawToken = crypto.randomBytes(32).toString("hex");
          const tokenHash = crypto
            .createHash("sha256")
            .update(rawToken)
            .digest("hex");

          const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

          await AccountLink.create({
            userId: user._id,
            provider: "google",
            providerAccountId,
            email,
            tokenHash,
            expiresAt,
          });

          const linkUrl = `${process.env.FRONTEND_URL}/link-google?token=${rawToken}`;

          let html = loadTemplate("link-google.html");
          html = html.replace("{{LINK_URL}}", linkUrl);

          await sendEmail(
            user.email,
            "ChadAI: Confirm linking your Google account",
            html,
          );

          return res.redirect(
            `${process.env.FRONTEND_URL}/link-google-pending`,
          );
        }

        // Edge case: user exists and is Google user but no oauth record
        if (user.authProvider === "google") {
          await oauthModel.create({
            userId: user._id,
            provider: "google",
            providerAccountId,
            email,
            avatarUrl: picture,
          });
        }
      }
    }

    // 7 Update login timestamp
    user.lastLoginAt = new Date();
    await user.save();

    AuditLog.create({ userId: user._id, action: "google_login", source: "website", metadata: { ip: req.ip } }).catch(console.error);

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

    // res.cookie("refreshToken", refreshToken, {
    //   httpOnly: true,
    //   secure: false,
    //   sameSite: "lax",
    //   maxAge: 30 * 24 * 60 * 60 * 1000,
    // });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.redirect(
      `${process.env.FRONTEND_URL}/oauth-success?token=${accessToken}`,
    );
  } catch (error) {
    console.error("Google OAuth Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Google authentication failed" });
  }
};

const confirmGoogleLink = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Missing token" });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const linkRecord = await AccountLink.findOne({
      tokenHash,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!linkRecord) {
      return res.status(400).json({ error: "Invalid or expired link" });
    }

    const user = await userModel.findById(linkRecord.userId);
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    // Create OAuth account if missing
    let oauthAccount = await oauthModel.findOne({
      provider: linkRecord.provider,
      providerAccountId: linkRecord.providerAccountId,
    });

    if (!oauthAccount) {
      oauthAccount = await oauthModel.create({
        userId: user._id,
        provider: linkRecord.provider,
        providerAccountId: linkRecord.providerAccountId,
        email: linkRecord.email,
        avatarUrl: user.avatarUrl,
      });
    }

    linkRecord.usedAt = new Date();
    await linkRecord.save();

    user.lastLoginAt = new Date();
    await user.save();

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

    // res.cookie("refreshToken", refreshToken, {
    //   httpOnly: true,
    //   secure: false,
    //   sameSite: "lax",
    //   maxAge: 30 * 24 * 60 * 60 * 1000,
    // });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      accessToken,
      user: {
        id: user._id,
        email: user.email,
        plan: user.plan,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Confirm Google link error:", err);
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
  googleAuthStart,
  googleAuthCallback,
  getSessions,
  revokeSession,
  confirmGoogleLink,
};
