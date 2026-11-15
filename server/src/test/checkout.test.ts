import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import request from "supertest";
import {
  createTestApp,
  expectApiError,
  expectSuccess,
  expectTopLevel,
  loginAsOwner,
  productRow,
  resetTestData,
  rowCount,
  seedProduct,
  sendMalformedJson,
  setCookiePair,
  type TestContext,
} from "./test-app";

const milk = { name: "Milk 1L", amount: 24, priceSatang: 2500 };
const bread = { name: "Bread", amount: 5, priceSatang: 3000 };

describe("Checkout endpoint", () => {
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

  it("G1 rejects checkout without a session", async () => {
    const response = await request(context.app)
      .post("/api/checkout")
      .send({ items: [{ productId: 1, quantity: 1 }] });
    expectApiError(response, 401, "UNAUTHENTICATED");
  });

  it("G1 rejects checkout with a forged cookie", async () => {
    const response = await request(context.app)
      .post("/api/checkout")
      .set("Cookie", "sid=not-a-valid-session")
      .send({ items: [{ productId: 1, quantity: 1 }] });
    expectApiError(response, 401, "UNAUTHENTICATED");
  });

  it("G1 rejects checkout with a cookie after logout", async () => {
    const { agent, response: loginResponse } = await loginAsOwner(context.app);
    const oldCookie = setCookiePair(loginResponse);
    await agent.post("/api/auth/logout");
    const response = await request(context.app)
      .post("/api/checkout")
      .set("Cookie", oldCookie)
      .send({ items: [{ productId: 1, quantity: 1 }] });
    expectApiError(response, 401, "UNAUTHENTICATED");
  });

  it("G3 rejects malformed JSON", async () => {
    const response = await sendMalformedJson(context.app, "post", "/api/checkout");
    expectApiError(response, 400, "BAD_REQUEST");
  });

  it("CO-1 checks out using database prices and snapshots sale lines", async () => {
    const milkId = seedProduct(context, milk);
    const breadId = seedProduct(context, bread);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.post("/api/checkout").send({
      items: [
        { productId: milkId, quantity: 2 },
        { productId: breadId, quantity: 1 },
      ],
    });

    expectSuccess(response, 201);
    expect(Number.isInteger(response.body.sale.id)).toBe(true);
    expect(response.body.sale.totalSatang).toBe(8000);
    expect(new Date(response.body.sale.createdAt).toISOString()).toBe(
      response.body.sale.createdAt,
    );
    expect(response.body.sale.createdAt).toMatch(/Z$/);
    expect(response.body.sale.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: milkId,
          name: milk.name,
          unitPriceSatang: milk.priceSatang,
          quantity: 2,
          lineTotalSatang: 5000,
        }),
        expect.objectContaining({
          productId: breadId,
          name: bread.name,
          unitPriceSatang: bread.priceSatang,
          quantity: 1,
          lineTotalSatang: 3000,
        }),
      ]),
    );
    expect(productRow(context, milkId)?.amount).toBe(22);
    expect(productRow(context, breadId)?.amount).toBe(4);
    expect(rowCount(context, "sales")).toBe(1);
    expect(rowCount(context, "sale_items")).toBe(2);

    const salesResponse = await agent.get("/api/sales?date=2026-11-15");
    expect(salesResponse.status).toBe(200);
    expect(salesResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: response.body.sale.id, totalSatang: 8000 }),
      ]),
    );
  });

  it.each([
    ["unitPriceSatang in an item", (milkId: number) => ({
      items: [{ productId: milkId, quantity: 1, unitPriceSatang: 1 }],
    })],
    ["totalSatang in the body", (milkId: number) => ({
      items: [{ productId: milkId, quantity: 1 }],
      totalSatang: 1,
    })],
    ["an unknown item field", (milkId: number) => ({
      items: [{ productId: milkId, quantity: 1, id: 99 }],
    })],
  ])("CO-2 rejects client-controlled %s without changing data", async (_caseName, bodyFactory) => {
    const milkId = seedProduct(context, milk);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.post("/api/checkout").send(bodyFactory(milkId));

    expectApiError(response, 422, "VALIDATION_ERROR");
    expect(productRow(context, milkId)?.amount).toBe(milk.amount);
    expect(rowCount(context, "sales")).toBe(0);
    expect(rowCount(context, "sale_items")).toBe(0);
  });

  it("CO-3 allows purchasing the exact remaining stock", async () => {
    const breadId = seedProduct(context, bread);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent
      .post("/api/checkout")
      .send({ items: [{ productId: breadId, quantity: bread.amount }] });

    expect(response.status).toBe(201);
    expect(response.body.sale.totalSatang).toBe(15000);
    expect(productRow(context, breadId)?.amount).toBe(0);
  });

  it("CO-4 reports insufficient stock and leaves inventory and sales unchanged", async () => {
    const milkId = seedProduct(context, milk);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent
      .post("/api/checkout")
      .send({ items: [{ productId: milkId, quantity: 25 }] });

    expectApiError(response, 409, "INSUFFICIENT_STOCK");
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: milkId,
          name: milk.name,
          requested: 25,
          available: 24,
        }),
      ]),
    );
    expect(productRow(context, milkId)?.amount).toBe(24);
    expect(rowCount(context, "sales")).toBe(0);
  });

  it("CO-5 rolls back all items when a later item lacks stock", async () => {
    const milkId = seedProduct(context, milk);
    const breadId = seedProduct(context, bread);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.post("/api/checkout").send({
      items: [
        { productId: milkId, quantity: 2 },
        { productId: breadId, quantity: 6 },
      ],
    });

    expectApiError(response, 409, "INSUFFICIENT_STOCK");
    expect(productRow(context, milkId)?.amount).toBe(24);
    expect(productRow(context, breadId)?.amount).toBe(5);
    expect(rowCount(context, "sales")).toBe(0);
    expect(rowCount(context, "sale_items")).toBe(0);
  });

  it("CO-6 reports every item with insufficient stock", async () => {
    const milkId = seedProduct(context, { ...milk, amount: 1 });
    const breadId = seedProduct(context, { ...bread, amount: 1 });
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.post("/api/checkout").send({
      items: [
        { productId: milkId, quantity: 2 },
        { productId: breadId, quantity: 3 },
      ],
    });

    expectApiError(response, 409, "INSUFFICIENT_STOCK");
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: milkId,
          name: milk.name,
          requested: 2,
          available: 1,
        }),
        expect.objectContaining({
          productId: breadId,
          name: bread.name,
          requested: 3,
          available: 1,
        }),
      ]),
    );
    expect(productRow(context, milkId)?.amount).toBe(1);
    expect(productRow(context, breadId)?.amount).toBe(1);
    expect(rowCount(context, "sales")).toBe(0);
  });

  it("CO-7 returns not found for missing or deleted products", async () => {
    const { agent } = await loginAsOwner(context.app);
    const missingProduct = await agent.post("/api/checkout").send({
      items: [{ productId: 999, quantity: 1 }],
    });
    expectApiError(missingProduct, 404, "PRODUCT_NOT_FOUND");

    const deletedProductId = seedProduct(context, milk);
    const deleteResponse = await agent.delete(`/api/products/${deletedProductId}`);
    expect(deleteResponse.status).toBe(204);
    const checkoutResponse = await agent.post("/api/checkout").send({
      items: [{ productId: deletedProductId, quantity: 1 }],
    });
    expectApiError(checkoutResponse, 404, "PRODUCT_NOT_FOUND");
    expect(rowCount(context, "sales")).toBe(0);
  });

  it.each([
    ["empty items", { items: [] }],
    ["missing items", {}],
    ["null items", { items: null }],
    ["non-array items", { items: "one item" }],
  ])("CO-8 rejects %s", async (_caseName, body) => {
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.post("/api/checkout").send(body);
    expectApiError(response, 422, "VALIDATION_ERROR");
    expect(rowCount(context, "sales")).toBe(0);
  });

  const invalidCheckoutItems: Array<
    [string, { productId?: unknown; quantity?: unknown }]
  > = [
    ["zero quantity", { productId: 1, quantity: 0 }],
    ["negative quantity", { productId: 1, quantity: -1 }],
    ["fractional quantity", { productId: 1, quantity: 1.5 }],
    ["string quantity", { productId: 1, quantity: "2" }],
    ["missing quantity", { productId: 1 }],
    ["missing product ID", { quantity: 1 }],
    ["fractional product ID", { productId: 1.5, quantity: 1 }],
    ["string product ID", { productId: "1", quantity: 1 }],
    ["null product ID", { productId: null, quantity: 1 }],
  ];

  it.each(invalidCheckoutItems)("CO-9 rejects %s", async (_caseName, item) => {
    const milkId = seedProduct(context, milk);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.post("/api/checkout").send({
      items: [{ ...item, productId: item.productId === 1 ? milkId : item.productId }],
    });

    expectApiError(response, 422, "VALIDATION_ERROR");
    expect(productRow(context, milkId)?.amount).toBe(24);
    expect(rowCount(context, "sales")).toBe(0);
  });

  it("CO-10 rejects duplicate product IDs within one checkout", async () => {
    const milkId = seedProduct(context, milk);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.post("/api/checkout").send({
      items: [
        { productId: milkId, quantity: 1 },
        { productId: milkId, quantity: 1 },
      ],
    });

    expectApiError(response, 422, "VALIDATION_ERROR");
    expect(productRow(context, milkId)?.amount).toBe(24);
    expect(rowCount(context, "sales")).toBe(0);
  });

  it("CO-11 charges the current database price, not a stale cart price", async () => {
    const milkId = seedProduct(context, { ...milk, priceSatang: 2750 });
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.post("/api/checkout").send({
      items: [{ productId: milkId, quantity: 2 }],
    });

    expect(response.status).toBe(201);
    expect(response.body.sale.totalSatang).toBe(5500);
    expect(response.body.sale.items[0]).toMatchObject({
      unitPriceSatang: 2750,
      lineTotalSatang: 5500,
    });
  });

  it("CO-12 serializes concurrent purchases of the last unit", async () => {
    const productId = seedProduct(context, { ...bread, amount: 1 });
    const { agent } = await loginAsOwner(context.app);
    const body = { items: [{ productId, quantity: 1 }] };
    const responses = await Promise.all([
      agent.post("/api/checkout").send(body),
      agent.post("/api/checkout").send(body),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expectTopLevel(responses.find((response) => response.status === 201)!);
    expectApiError(
      responses.find((response) => response.status === 409)!,
      409,
      "INSUFFICIENT_STOCK",
    );
    expect(productRow(context, productId)?.amount).toBe(0);
    expect(rowCount(context, "sales")).toBe(1);
  });

  it("CO-13 rolls back inventory and sale rows on a database failure", async () => {
    const productId = seedProduct(context, milk);
    context.db.$client.exec(`
      CREATE TRIGGER fail_sale_item_insert
      BEFORE INSERT ON sale_items
      BEGIN
        SELECT RAISE(ABORT, 'test database failure');
      END;
    `);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.post("/api/checkout").send({
      items: [{ productId, quantity: 2 }],
    });

    expectApiError(response, 500, "INTERNAL_ERROR");
    expect(JSON.stringify(response.body)).not.toContain("test database failure");
    expect(productRow(context, productId)?.amount).toBe(24);
    expect(rowCount(context, "sales")).toBe(0);
    expect(rowCount(context, "sale_items")).toBe(0);
  });
});
