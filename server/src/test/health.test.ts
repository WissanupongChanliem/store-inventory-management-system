import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createApp } from "../app";
import { createDatabase } from "../db";

describe("GET /api/health", () => {
  it("HEALTH-1 returns the status at the top level", async () => {
    const database = createDatabase(":memory:");
    const app = createApp({ db: database.db });

    try {
      const response = await request(app).get("/api/health");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "ok" });
    } finally {
      database.close();
    }
  });

  it("HEALTH-2 returns a safe service error when SQLite is unavailable", async () => {
    const database = createDatabase(":memory:");
    database.close();
    const app = createApp({ db: database.db });

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body.error).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "Service unavailable",
    });
    expect(response.body.error.requestId).toBeTruthy();
    expect(JSON.stringify(response.body)).not.toContain("not open");
  });
});
