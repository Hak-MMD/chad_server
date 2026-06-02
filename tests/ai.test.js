jest.mock("../utils/sendEmail", () => jest.fn().mockResolvedValue(true));
jest.mock("../utils/uploadImage", () => ({
  uploadImageBase64: jest.fn().mockResolvedValue({
    url: "https://res.cloudinary.com/test/image/upload/v1/test.jpg",
    width: 800,
    height: 600,
    mimeType: "image/jpeg",
  }),
}));
jest.mock("../utils/summarizationWorker", () => ({
  enqueueMessageSummary: jest.fn(),
  enqueueConversationSummary: jest.fn(),
  CONVERSATION_SUMMARY_INTERVAL: 10,
}));
jest.mock("../config/openai", () => ({
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
}));

const request = require("supertest");
const app = require("../server");
const openai = require("../config/openai");
const { connectTestDb, clearDb, closeTestDb } = require("./helpers/db");
const { createUser, createChat, tokenFor } = require("./helpers/factories");
const UsageStats = require("../models/UsageStats");
const Message = require("../models/Message");

const FAKE_COMPLETION = {
  model: "gpt-5-nano",
  choices: [{ message: { content: "Hello from AI" } }],
  usage: { prompt_tokens: 10, completion_tokens: 20 },
};

beforeAll(connectTestDb);
afterEach(async () => {
  await clearDb();
  jest.clearAllMocks();
});
afterAll(closeTestDb);

// ─── AUTH GUARDS ──────────────────────────────────────────────────────────────

describe("POST /api/v2/ai/message — auth", () => {
  it("returns 401 without auth token", async () => {
    const res = await request(app).post("/api/v2/ai/message").send({});
    expect(res.status).toBe(401);
  });

  it("returns 403 for unverified user", async () => {
    const user = await createUser({ emailVerified: false });
    const chat = await createChat(user._id);

    const res = await request(app)
      .post("/api/v2/ai/message")
      .set("Authorization", tokenFor(user))
      .send({ chatId: chat._id.toString(), text: "Hello" });

    expect(res.status).toBe(403);
  });
});

// ─── VALIDATION ───────────────────────────────────────────────────────────────

describe("POST /api/v2/ai/message — validation", () => {
  it("returns 400 when chatId is missing", async () => {
    const user = await createUser();
    const res = await request(app)
      .post("/api/v2/ai/message")
      .set("Authorization", tokenFor(user))
      .send({ text: "Hello" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when chatId is not a valid ObjectId", async () => {
    const user = await createUser();
    const res = await request(app)
      .post("/api/v2/ai/message")
      .set("Authorization", tokenFor(user))
      .send({ chatId: "not-an-objectid", text: "Hello" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when text exceeds 20000 characters", async () => {
    const user = await createUser();
    const chat = await createChat(user._id);
    const res = await request(app)
      .post("/api/v2/ai/message")
      .set("Authorization", tokenFor(user))
      .send({ chatId: chat._id.toString(), text: "x".repeat(20001) });
    expect(res.status).toBe(400);
  });
});

// ─── CHAT OWNERSHIP ───────────────────────────────────────────────────────────

describe("POST /api/v2/ai/message — chat ownership", () => {
  it("returns 403 when sending to another user's chat", async () => {
    openai.chat.completions.create.mockResolvedValue(FAKE_COMPLETION);

    const userA = await createUser();
    const userB = await createUser();
    const chat = await createChat(userA._id);

    const res = await request(app)
      .post("/api/v2/ai/message")
      .set("Authorization", tokenFor(userB))
      .send({ chatId: chat._id.toString(), text: "Hello" });

    expect(res.status).toBe(403);
  });
});

// ─── SUCCESS ──────────────────────────────────────────────────────────────────

describe("POST /api/v2/ai/message — success", () => {
  it("returns AI reply and remaining counts", async () => {
    openai.chat.completions.create.mockResolvedValue(FAKE_COMPLETION);

    const user = await createUser();
    const chat = await createChat(user._id);

    const res = await request(app)
      .post("/api/v2/ai/message")
      .set("Authorization", tokenFor(user))
      .send({ chatId: chat._id.toString(), text: "Hello" });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe("Hello from AI");
    expect(res.body.modelUsed).toBe("gpt-5-nano");
    expect(res.body.remaining).toBeDefined();
    expect(res.body.remaining.daily).toBeGreaterThanOrEqual(0);
    expect(res.body.remaining.monthly).toBeGreaterThanOrEqual(0);
    expect(openai.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it("persists both user and assistant messages to DB", async () => {
    openai.chat.completions.create.mockResolvedValue(FAKE_COMPLETION);

    const user = await createUser();
    const chat = await createChat(user._id);

    await request(app)
      .post("/api/v2/ai/message")
      .set("Authorization", tokenFor(user))
      .send({ chatId: chat._id.toString(), text: "Persist me" });

    const messages = await Message.find({ chatId: chat._id });
    expect(messages).toHaveLength(2);
    expect(messages.find((m) => m.role === "user")).toBeDefined();
    expect(messages.find((m) => m.role === "assistant")).toBeDefined();
  });
});

// ─── USAGE LIMITS ─────────────────────────────────────────────────────────────

describe("POST /api/v2/ai/message — usage limits", () => {
  it("returns 429 when daily limit is exhausted", async () => {
    const user = await createUser({ plan: "free" });
    const chat = await createChat(user._id);

    // Exhaust the daily limit (free plan = 10/day)
    await UsageStats.updateOne(
      { userId: user._id },
      { dailyCount: 10 },
    );

    const res = await request(app)
      .post("/api/v2/ai/message")
      .set("Authorization", tokenFor(user))
      .send({ chatId: chat._id.toString(), text: "One more" });

    expect(res.status).toBe(429);
    expect(res.body.upgradeRequired).toBe(true);
  });

  it("returns 429 when monthly limit is exhausted", async () => {
    const user = await createUser({ plan: "free" });
    const chat = await createChat(user._id);

    await UsageStats.updateOne(
      { userId: user._id },
      { monthlyCount: 40 },
    );

    const res = await request(app)
      .post("/api/v2/ai/message")
      .set("Authorization", tokenFor(user))
      .send({ chatId: chat._id.toString(), text: "One more" });

    expect(res.status).toBe(429);
    expect(res.body.upgradeRequired).toBe(true);
  });
});

// ─── IDEMPOTENCY ──────────────────────────────────────────────────────────────

describe("POST /api/v2/ai/message — idempotency", () => {
  it("returns cached response on duplicate idempotency key", async () => {
    openai.chat.completions.create.mockResolvedValue(FAKE_COMPLETION);

    const user = await createUser();
    const chat = await createChat(user._id);
    const key = "idem-key-abc123";

    // First request
    const first = await request(app)
      .post("/api/v2/ai/message")
      .set("Authorization", tokenFor(user))
      .send({ chatId: chat._id.toString(), text: "Hello", idempotencyKey: key });

    expect(first.status).toBe(200);

    // Re-fetch user token (usage stats changed, but token is valid for plan/role)
    const second = await request(app)
      .post("/api/v2/ai/message")
      .set("Authorization", tokenFor(user))
      .send({ chatId: chat._id.toString(), text: "Hello", idempotencyKey: key });

    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);
    // OpenAI should only have been called once
    expect(openai.chat.completions.create).toHaveBeenCalledTimes(1);
  });
});
