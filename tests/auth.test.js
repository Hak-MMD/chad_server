jest.mock("../utils/sendEmail", () => jest.fn().mockResolvedValue(true));

const request = require("supertest");
const app = require("../server");
const { connectTestDb, clearDb, closeTestDb } = require("./helpers/db");
const { createUser, tokenFor, createVerificationCode } = require("./helpers/factories");
const User = require("../models/User");
const AuthRefresh = require("../models/AuthRefresh");

beforeAll(connectTestDb);
afterEach(clearDb);
afterAll(closeTestDb);

// ─── REGISTER ────────────────────────────────────────────────────────────────

describe("POST /api/v2/auth/register", () => {
  it("registers successfully and returns a message", async () => {
    const res = await request(app).post("/api/v2/auth/register").send({
      email: "new@example.com",
      password: "SecurePass1!",
      name: "Alice",
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/verify/i);
  });

  it("rejects duplicate email", async () => {
    await createUser({ email: "dup@example.com" });
    const res = await request(app).post("/api/v2/auth/register").send({
      email: "dup@example.com",
      password: "SecurePass1!",
      name: "Bob",
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing name", async () => {
    const res = await request(app).post("/api/v2/auth/register").send({
      email: "noname@example.com",
      password: "SecurePass1!",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/validation/i);
  });

  it("rejects invalid email format", async () => {
    const res = await request(app).post("/api/v2/auth/register").send({
      email: "not-an-email",
      password: "SecurePass1!",
      name: "Charlie",
    });
    expect(res.status).toBe(400);
  });

  it("rejects weak password (too short)", async () => {
    const res = await request(app).post("/api/v2/auth/register").send({
      email: "weak@example.com",
      password: "abc",
      name: "Dan",
    });
    expect(res.status).toBe(400);
  });
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────

describe("POST /api/v2/auth/login", () => {
  it("logs in and returns accessToken + sets cookie", async () => {
    await createUser({ email: "login@example.com" });
    const res = await request(app).post("/api/v2/auth/login").send({
      email: "login@example.com",
      password: "TestPass123!",
    });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects invalid password", async () => {
    await createUser({ email: "badpass@example.com" });
    const res = await request(app).post("/api/v2/auth/login").send({
      email: "badpass@example.com",
      password: "WrongPass99!",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  it("rejects non-existent email", async () => {
    const res = await request(app).post("/api/v2/auth/login").send({
      email: "ghost@example.com",
      password: "TestPass123!",
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing fields (validation)", async () => {
    const res = await request(app).post("/api/v2/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/validation/i);
  });
});

// ─── VERIFY EMAIL ─────────────────────────────────────────────────────────────

describe("POST /api/v2/auth/verify-email", () => {
  it("verifies email with correct code", async () => {
    const user = await createUser({ email: "verify@example.com", emailVerified: false });
    const code = await createVerificationCode(user._id);

    const res = await request(app).post("/api/v2/auth/verify-email").send({
      email: "verify@example.com",
      code,
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/verified/i);

    const updated = await User.findById(user._id);
    expect(updated.emailVerified).toBe(true);
  });

  it("rejects wrong code", async () => {
    const user = await createUser({ email: "wrongcode@example.com", emailVerified: false });
    await createVerificationCode(user._id);

    const res = await request(app).post("/api/v2/auth/verify-email").send({
      email: "wrongcode@example.com",
      code: "000000",
    });
    expect(res.status).toBe(400);
  });

  it("rejects expired code", async () => {
    const user = await createUser({ email: "expired@example.com", emailVerified: false });
    await createVerificationCode(user._id, { expiresInMs: -1000 }); // already expired

    const res = await request(app).post("/api/v2/auth/verify-email").send({
      email: "expired@example.com",
      code: "123456",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it("rejects code that is not 6 digits (validation)", async () => {
    const res = await request(app).post("/api/v2/auth/verify-email").send({
      email: "x@example.com",
      code: "abc",
    });
    expect(res.status).toBe(400);
  });
});

// ─── REFRESH TOKEN ────────────────────────────────────────────────────────────

describe("POST /api/v2/auth/refresh", () => {
  it("issues a new access token with a valid refresh cookie", async () => {
    await createUser({ email: "refresh@example.com" });

    // Login to get the refresh token cookie
    const loginRes = await request(app).post("/api/v2/auth/login").send({
      email: "refresh@example.com",
      password: "TestPass123!",
    });
    const cookies = loginRes.headers["set-cookie"];

    const res = await request(app)
      .post("/api/v2/auth/refresh")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it("rejects when no refresh token is provided", async () => {
    const res = await request(app).post("/api/v2/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("rejects an invalid refresh token", async () => {
    const res = await request(app)
      .post("/api/v2/auth/refresh")
      .set("Cookie", ["refreshToken=invalidtoken123"]);
    expect(res.status).toBe(401);
  });
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────

describe("POST /api/v2/auth/logout", () => {
  it("clears the refresh token cookie", async () => {
    await createUser({ email: "logout@example.com" });
    const loginRes = await request(app).post("/api/v2/auth/login").send({
      email: "logout@example.com",
      password: "TestPass123!",
    });

    const res = await request(app)
      .post("/api/v2/auth/logout")
      .set("Cookie", loginRes.headers["set-cookie"]);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out/i);
  });
});

// ─── GET /me ──────────────────────────────────────────────────────────────────

describe("GET /api/v2/auth/me", () => {
  it("returns user profile for authenticated request", async () => {
    const user = await createUser({ email: "me@example.com" });
    const res = await request(app)
      .get("/api/v2/auth/me")
      .set("Authorization", tokenFor(user));

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.usage).toBeDefined();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/v2/auth/me");
    expect(res.status).toBe(401);
  });
});
