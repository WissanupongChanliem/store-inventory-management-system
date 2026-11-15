const request = require("supertest");
const { createApp } = require("../../dist/app");

describe("GET /api/health", () => {
  it("HEALTH-1 returns the status at the top level", async () => {
    const app = createApp({ db: { get: jest.fn() } });

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("HEALTH-2 returns a safe service error when SQLite is unavailable", async () => {
    const app = createApp({
      db: {
        get: () => {
          throw new Error("database details must not be exposed");
        },
      },
    });

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body.error).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "Service unavailable",
    });
    expect(response.body.error.requestId).toBeTruthy();
    expect(JSON.stringify(response.body)).not.toContain("database details");
  });
});
