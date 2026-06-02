const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../../models/User");
const Chat = require("../../models/Chat");
const UsageStats = require("../../models/UsageStats");
const EmailVerification = require("../../models/EmailVerification");
const { generateAccessToken } = require("../../utils/jwt");
const { nextDay, nextMonth } = require("../../utils/dateHelpers");

let seq = 0;

async function createUser(overrides = {}) {
  seq++;
  const passwordHash = await bcrypt.hash("TestPass123!", 4); // low rounds for test speed
  const data = {
    email: `user${seq}@example.com`,
    passwordHash,
    name: "Test User",
    authProvider: "email",
    emailVerified: true,
    plan: "free",
    role: "user",
    ...overrides,
  };
  const user = await User.create(data);
  await UsageStats.create({
    userId: user._id,
    dailyResetAt: nextDay(),
    monthlyResetAt: nextMonth(),
  });
  return user;
}

async function createChat(userId, overrides = {}) {
  return Chat.create({
    userId,
    title: "Test Chat",
    source: "website",
    type: "mixed",
    ...overrides,
  });
}

function tokenFor(user) {
  return `Bearer ${generateAccessToken(user)}`;
}

// Creates an EmailVerification record with a known plaintext code.
// Returns the plaintext code so the test can submit it.
async function createVerificationCode(userId, { expiresInMs = 15 * 60 * 1000 } = {}) {
  const code = "123456";
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  await EmailVerification.create({
    userId,
    codeHash,
    expiresAt: new Date(Date.now() + expiresInMs),
  });
  return code;
}

module.exports = { createUser, createChat, tokenFor, createVerificationCode };
