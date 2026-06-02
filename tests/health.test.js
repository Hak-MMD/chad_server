const request = require("supertest");
const app = require("../server");
const { connectTestDb, closeTestDb } = require("./helpers/db");

beforeAll(connectTestDb);
afterAll(closeTestDb);

describe("GET /health", () => {
  it("returns 200 with status ok when DB is connected", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe("connected");
    expect(typeof res.body.ts).toBe("string");
  });
});
