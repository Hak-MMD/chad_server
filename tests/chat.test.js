const request = require("supertest");
const app = require("../server");
const { connectTestDb, clearDb, closeTestDb } = require("./helpers/db");
const { createUser, createChat, tokenFor } = require("./helpers/factories");
const Chat = require("../models/Chat");

beforeAll(connectTestDb);
afterEach(clearDb);
afterAll(closeTestDb);

// ─── LIST CHATS ───────────────────────────────────────────────────────────────

describe("GET /api/v2/chat/", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/v2/chat/");
    expect(res.status).toBe(401);
  });

  it("returns empty array for new user with no chats", async () => {
    const user = await createUser();
    const res = await request(app)
      .get("/api/v2/chat/")
      .set("Authorization", tokenFor(user));
    expect(res.status).toBe(200);
    expect(res.body.chats).toEqual([]);
  });

  it("returns only the authenticated user's chats", async () => {
    const userA = await createUser();
    const userB = await createUser();
    await createChat(userA._id, { title: "A's chat" });
    await createChat(userB._id, { title: "B's chat" });

    const res = await request(app)
      .get("/api/v2/chat/")
      .set("Authorization", tokenFor(userA));

    expect(res.status).toBe(200);
    expect(res.body.chats).toHaveLength(1);
    expect(res.body.chats[0].title).toBe("A's chat");
  });

  it("does not return soft-deleted chats", async () => {
    const user = await createUser();
    await createChat(user._id, { isDeleted: true });

    const res = await request(app)
      .get("/api/v2/chat/")
      .set("Authorization", tokenFor(user));

    expect(res.status).toBe(200);
    expect(res.body.chats).toHaveLength(0);
  });

  it("returns 403 for unverified user", async () => {
    const user = await createUser({ emailVerified: false });
    const res = await request(app)
      .get("/api/v2/chat/")
      .set("Authorization", tokenFor(user));
    expect(res.status).toBe(403);
  });
});

// ─── CREATE CHAT ──────────────────────────────────────────────────────────────

describe("POST /api/v2/chat/", () => {
  it("creates a chat with defaults", async () => {
    const user = await createUser();
    const res = await request(app)
      .post("/api/v2/chat/")
      .set("Authorization", tokenFor(user))
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.chat.title).toBe("New chat");
    expect(res.body.chat.userId.toString()).toBe(user._id.toString());
  });

  it("creates a chat with a custom title", async () => {
    const user = await createUser();
    const res = await request(app)
      .post("/api/v2/chat/")
      .set("Authorization", tokenFor(user))
      .send({ title: "My project", source: "website" });

    expect(res.status).toBe(201);
    expect(res.body.chat.title).toBe("My project");
  });

  it("rejects title over 100 characters", async () => {
    const user = await createUser();
    const res = await request(app)
      .post("/api/v2/chat/")
      .set("Authorization", tokenFor(user))
      .send({ title: "x".repeat(101) });

    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/v2/chat/").send({ title: "Test" });
    expect(res.status).toBe(401);
  });
});

// ─── GET MESSAGES ─────────────────────────────────────────────────────────────

describe("GET /api/v2/chat/:id/messages", () => {
  it("returns empty messages array for a new chat", async () => {
    const user = await createUser();
    const chat = await createChat(user._id);

    const res = await request(app)
      .get(`/api/v2/chat/${chat._id}/messages`)
      .set("Authorization", tokenFor(user));

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
    expect(res.body.chatId.toString()).toBe(chat._id.toString());
  });

  it("returns 404 for a chat that belongs to another user", async () => {
    const userA = await createUser();
    const userB = await createUser();
    const chat = await createChat(userA._id);

    const res = await request(app)
      .get(`/api/v2/chat/${chat._id}/messages`)
      .set("Authorization", tokenFor(userB));

    expect(res.status).toBe(404);
  });

  it("returns 400 for an invalid chatId", async () => {
    const user = await createUser();
    const res = await request(app)
      .get("/api/v2/chat/not-a-valid-id/messages")
      .set("Authorization", tokenFor(user));
    expect(res.status).toBe(400);
  });
});

// ─── UPDATE CHAT ──────────────────────────────────────────────────────────────

describe("PATCH /api/v2/chat/:id", () => {
  it("updates the chat title", async () => {
    const user = await createUser();
    const chat = await createChat(user._id);

    const res = await request(app)
      .patch(`/api/v2/chat/${chat._id}`)
      .set("Authorization", tokenFor(user))
      .send({ title: "Renamed chat" });

    expect(res.status).toBe(200);
    expect(res.body.chat.title).toBe("Renamed chat");
  });

  it("returns 404 when updating another user's chat", async () => {
    const userA = await createUser();
    const userB = await createUser();
    const chat = await createChat(userA._id);

    const res = await request(app)
      .patch(`/api/v2/chat/${chat._id}`)
      .set("Authorization", tokenFor(userB))
      .send({ title: "Hijacked" });

    expect(res.status).toBe(404);
  });

  it("rejects empty title (validation)", async () => {
    const user = await createUser();
    const chat = await createChat(user._id);

    const res = await request(app)
      .patch(`/api/v2/chat/${chat._id}`)
      .set("Authorization", tokenFor(user))
      .send({ title: "" });

    expect(res.status).toBe(400);
  });
});

// ─── DELETE CHAT ──────────────────────────────────────────────────────────────

describe("DELETE /api/v2/chat/:id", () => {
  it("soft-deletes the chat (isDeleted: true)", async () => {
    const user = await createUser();
    const chat = await createChat(user._id);

    const res = await request(app)
      .delete(`/api/v2/chat/${chat._id}`)
      .set("Authorization", tokenFor(user));

    expect(res.status).toBe(200);

    const deleted = await Chat.findById(chat._id);
    expect(deleted.isDeleted).toBe(true);
  });

  it("returns 404 when deleting another user's chat", async () => {
    const userA = await createUser();
    const userB = await createUser();
    const chat = await createChat(userA._id);

    const res = await request(app)
      .delete(`/api/v2/chat/${chat._id}`)
      .set("Authorization", tokenFor(userB));

    expect(res.status).toBe(404);
  });

  it("returns 404 when deleting an already-deleted chat", async () => {
    const user = await createUser();
    const chat = await createChat(user._id, { isDeleted: true });

    const res = await request(app)
      .delete(`/api/v2/chat/${chat._id}`)
      .set("Authorization", tokenFor(user));

    expect(res.status).toBe(404);
  });
});
