import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";
import {
  createTestApp,
  expectApiError,
  expectSuccess,
  loginAsOwner,
  resetTestData,
  seedProduct,
  seedSale,
  sendMalformedJson,
  setCookiePair,
  type TestContext,
} from "./test-app";

describe("Sales endpoint", () => {
  let context: TestContext;

  beforeAll(() => {
    context = createTestApp();
  });

  beforeEach(() => {
    resetTestData(context);
  });

  afterAll(() => {
    context.closeDatabase();
  });

  it("G1 rejects sales requests without a session", async () => {
    const response = await request(context.app).get("/api/sales?date=2026-11-15");
    expectApiError(response, 401, "UNAUTHENTICATED");
  });

  it("G1 rejects sales requests with a forged cookie", async () => {
    const response = await request(context.app)
      .get("/api/sales?date=2026-11-15")
      .set("Cookie", "sid=not-a-valid-session");
    expectApiError(response, 401, "UNAUTHENTICATED");
  });

  it("G1 rejects sales requests with a cookie after logout", async () => {
    const { agent, response: loginResponse } = await loginAsOwner(context.app);
    const oldCookie = setCookiePair(loginResponse);
    await agent.post("/api/auth/logout");
    const response = await request(context.app)
      .get("/api/sales?date=2026-11-15")
      .set("Cookie", oldCookie);
    expectApiError(response, 401, "UNAUTHENTICATED");
  });

  it("G3 rejects malformed JSON on GET /api/sales", async () => {
    const response = await sendMalformedJson(context.app, "get", "/api/sales");
    expectApiError(response, 400, "BAD_REQUEST");
  });

  it("SALES-1 returns the day's sales newest first and summarizes totals", async () => {
    seedSale(
      context,
      [{ productId: 1, name: "Milk", unitPriceSatang: 2500, quantity: 2 }],
      "2026-11-15T03:20:00.000Z",
    );
    seedSale(
      context,
      [
        { productId: 2, name: "Bread", unitPriceSatang: 3000, quantity: 1 },
        { productId: 3, name: "Tea", unitPriceSatang: 2000, quantity: 1 },
      ],
      "2026-11-15T04:20:00.000Z",
    );
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.get("/api/sales?date=2026-11-15");

    expectSuccess(response, 200);
    expect(response.body).toMatchObject({
      date: "2026-11-15",
      timezone: "Asia/Bangkok",
      summary: { saleCount: 2, totalSatang: 10000 },
    });
    expect(response.body.items).toHaveLength(2);
    expect(new Date(response.body.items[0].createdAt).getTime()).toBeGreaterThan(
      new Date(response.body.items[1].createdAt).getTime(),
    );
  });

  it("SALES-2 returns zero totals for a date without sales", async () => {
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.get("/api/sales?date=2026-11-15");

    expectSuccess(response, 200);
    expect(response.body).toMatchObject({
      date: "2026-11-15",
      summary: { saleCount: 0, totalSatang: 0 },
      items: [],
    });
  });

  it("SALES-3 defaults to today in the configured store timezone", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-11-15T18:00:00.000Z"));
    try {
      const { agent } = await loginAsOwner(context.app);
      const response = await agent.get("/api/sales");

      expect(response.status).toBe(200);
      expect(response.body.date).toBe("2026-11-16");
      expect(response.body.timezone).toBe("Asia/Bangkok");
    } finally {
      jest.useRealTimers();
    }
  });

  it("SALES-4 assigns sales to calendar days in Asia/Bangkok at the UTC boundary", async () => {
    seedSale(
      context,
      [{ productId: 1, name: "Before midnight", unitPriceSatang: 100, quantity: 1 }],
      "2026-11-15T16:59:59.000Z",
    );
    seedSale(
      context,
      [{ productId: 2, name: "At midnight", unitPriceSatang: 200, quantity: 1 }],
      "2026-11-15T17:00:00.000Z",
    );
    const { agent } = await loginAsOwner(context.app);
    const fifteenth = await agent.get("/api/sales?date=2026-11-15");
    const sixteenth = await agent.get("/api/sales?date=2026-11-16");

    expect(fifteenth.status).toBe(200);
    expect(fifteenth.body.items).toHaveLength(1);
    expect(fifteenth.body.items[0].items[0].name).toBe("Before midnight");
    expect(sixteenth.status).toBe(200);
    expect(sixteenth.body.items).toHaveLength(1);
    expect(sixteenth.body.items[0].items[0].name).toBe("At midnight");
  });

  it.each(["2026-13-01", "2026-02-30", "15-11-2026", "abc"])(
    "SALES-5 rejects invalid date %s",
    async (date) => {
      const { agent } = await loginAsOwner(context.app);
      const response = await agent.get(`/api/sales?date=${encodeURIComponent(date)}`);
      expectApiError(response, 400, "BAD_REQUEST");
    },
  );

  it("SALES-6 returns line and sale totals consistent with item quantities", async () => {
    seedSale(context, [
      { productId: 1, name: "Milk", unitPriceSatang: 2500, quantity: 2 },
      { productId: 2, name: "Bread", unitPriceSatang: 3000, quantity: 1 },
    ]);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.get("/api/sales?date=2026-11-15");

    expect(response.status).toBe(200);
    const sale = response.body.items[0];
    const computedTotal = sale.items.reduce(
      (total: number, item: { unitPriceSatang: number; quantity: number; lineTotalSatang: number }) => {
        expect(item.lineTotalSatang).toBe(item.unitPriceSatang * item.quantity);
        return total + item.lineTotalSatang;
      },
      0,
    );
    expect(sale.totalSatang).toBe(computedTotal);
    expect(response.body.summary.totalSatang).toBe(computedTotal);
  });

  it("SALES-7 preserves historical product name and price after update and deletion", async () => {
    const productId = seedProduct(context, {
      name: "Milk 1L",
      amount: 10,
      priceSatang: 2500,
    });
    seedSale(context, [
      { productId, name: "Milk 1L", unitPriceSatang: 2500, quantity: 2 },
    ]);
    const { agent } = await loginAsOwner(context.app);
    const updateResponse = await agent
      .patch(`/api/products/${productId}`)
      .send({ priceSatang: 3000 });
    expect(updateResponse.status).toBe(200);
    const deleteResponse = await agent.delete(`/api/products/${productId}`);
    expect(deleteResponse.status).toBe(204);

    const response = await agent.get("/api/sales?date=2026-11-15");
    expect(response.status).toBe(200);
    expect(response.body.items[0].items[0]).toMatchObject({
      productId,
      name: "Milk 1L",
      unitPriceSatang: 2500,
      quantity: 2,
      lineTotalSatang: 5000,
    });
    expect(response.body.items[0].totalSatang).toBe(5000);
  });
});
