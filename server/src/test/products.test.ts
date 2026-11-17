import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import request from "supertest";
import {
  createApiErrorReporter,
  createTestApp,
  expectSuccess,
  expectValidProductTimestamps,
  loginAsOwner,
  productRow,
  resetTestData,
  rowCount,
  seedProduct,
  seedSale,
  sendMalformedJson,
  setCookiePair,
  type TestContext,
} from "./test-app";

type ProductProbe = {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  body?: Record<string, unknown>;
};

const protectedProductProbes: ProductProbe[] = [
  {
    method: "post",
    path: "/api/products",
    body: { name: "Milk 1L", amount: 24, priceSatang: 2500 },
  },
  { method: "patch", path: "/api/products/1", body: { name: "Milk 2L" } },
  { method: "get", path: "/api/products?search=milk&limit=1&offset=0" },
  { method: "delete", path: "/api/products/1" },
];

const validProduct = {
  name: "Milk 1L",
  amount: 24,
  priceSatang: 2500,
};

describe("Product endpoints", () => {
  let context: TestContext;
  const expectApiError = createApiErrorReporter(() => context);

  beforeAll(() => {
    context = createTestApp();
  });

  beforeEach(() => {
    resetTestData(context);
  });

  afterAll(() => {
    context.closeDatabase();
  });

  it("includes the API response and database state when an API error assertion fails", async () => {
    seedProduct(context, validProduct);
    const response = await request(context.app).get("/api/products");
    const requestInput = { method: "GET", path: "/api/products" };
    let failureMessage = "";
    let hasStackTrace = false;

    try {
      expectApiError(response, 500, "INTERNAL_ERROR", requestInput);
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      failureMessage = error.message;
      hasStackTrace = Boolean(error.stack);
    }

    expect(failureMessage).toContain("API response:");
    expect(failureMessage).toContain("Authentication required");
    expect(failureMessage).toContain(requestInput.path);
    expect(failureMessage).toContain("Database state:");
    expect(hasStackTrace).toBe(false);
    expect(failureMessage).toContain(validProduct.name);
    expect(failureMessage).not.toContain("password_hash");
    expect(failureMessage).not.toContain("token_hash");
  });

  it.each(protectedProductProbes)(
    "G1 rejects $method $path without a session",
    async ({ method, path, body }) => {
      const apiRequest = request(context.app)[method](path);
      const response = await (body ? apiRequest.send(body) : apiRequest);
      expectApiError(response, 401, "UNAUTHENTICATED", { method, path, body });
    },
  );

  it.each(protectedProductProbes)(
    "G1 rejects $method $path with a forged cookie",
    async ({ method, path, body }) => {
      const apiRequest = request(context.app)[method](path);
      const response = await (body ? apiRequest.send(body) : apiRequest)
        .set("Cookie", "sid=not-a-valid-session");
      expectApiError(response, 401, "UNAUTHENTICATED", { method, path, body });
    },
  );

  it.each(protectedProductProbes)(
    "G1 rejects $method $path using a cookie after logout",
    async ({ method, path, body }) => {
      const { agent, response: loginResponse } = await loginAsOwner(context.app);
      const oldCookie = setCookiePair(loginResponse);
      const logoutResponse = await agent.post("/api/auth/logout");
      expect(logoutResponse.status).toBe(204);

      const apiRequest = request(context.app)[method](path).set("Cookie", oldCookie);
      const response = await (body ? apiRequest.send(body) : apiRequest);
      expectApiError(response, 401, "UNAUTHENTICATED", { method, path, body });
    },
  );

  it.each([
    ["POST", "/api/products", "post"],
    ["PATCH", "/api/products/1", "patch"],
    ["GET", "/api/products", "get"],
    ["DELETE", "/api/products/1", "delete"],
  ] as const)("G3 rejects malformed JSON on %s %s", async (_method, path, method) => {
    const response = await sendMalformedJson(context.app, method, path);
    expectApiError(response, 400, "BAD_REQUEST", {
      method,
      path,
      body: '{"malformed":',
    });
  });

  it("PROD-C-1 creates a product and returns its top-level fields", async () => {
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.post("/api/products").send(validProduct);

    expectSuccess(response, 201);
    expect(response.body.product).toMatchObject(validProduct);
    expect(Number.isInteger(response.body.product.id)).toBe(true);
    expect(response.body.product.id).toBeGreaterThan(0);
    expectValidProductTimestamps(response.body.product);

    const listResponse = await agent.get("/api/products");
    expectSuccess(listResponse, 200);
    expect(listResponse.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: validProduct.name })]),
    );
  });

  it("PROD-C-2 trims product names before storing them", async () => {
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.post("/api/products").send({
      ...validProduct,
      name: "  Milk 1L  ",
    });

    expect(response.status).toBe(201);
    expect(response.body.product.name).toBe("Milk 1L");
  });

  it("PROD-C-3 rejects duplicate names without regard to case", async () => {
    seedProduct(context, validProduct);
    const { agent } = await loginAsOwner(context.app);

    const body = {
      ...validProduct,
      name: "mILK 1l",
    };
    const response = await agent.post("/api/products").send(body);

    expectApiError(response, 409, "PRODUCT_NAME_EXISTS", body);
    expect(rowCount(context, "products")).toBe(1);
  });

  it.each([
    ["empty body", {}, ["name", "amount", "priceSatang"]],
    ["missing name", { amount: 24, priceSatang: 2500 }, ["name"]],
    ["missing amount", { name: "Milk", priceSatang: 2500 }, ["amount"]],
    ["missing price", { name: "Milk", amount: 24 }, ["priceSatang"]],
    ["empty name", { name: "", amount: 24, priceSatang: 2500 }, ["name"]],
    ["whitespace-only name", { name: "   ", amount: 24, priceSatang: 2500 }, ["name"]],
    ["non-string name", { name: 7, amount: 24, priceSatang: 2500 }, ["name"]],
    ["101-character name", { name: "n".repeat(101), amount: 24, priceSatang: 2500 }, ["name"]],
    ["negative amount", { name: "Milk", amount: -1, priceSatang: 2500 }, ["amount"]],
    ["fractional amount", { name: "Milk", amount: 1.5, priceSatang: 2500 }, ["amount"]],
    ["string amount", { name: "Milk", amount: "5", priceSatang: 2500 }, ["amount"]],
    ["amount above maximum", { name: "Milk", amount: 1000001, priceSatang: 2500 }, ["amount"]],
    ["negative price", { name: "Milk", amount: 24, priceSatang: -1 }, ["priceSatang"]],
    ["fractional price", { name: "Milk", amount: 24, priceSatang: 1.5 }, ["priceSatang"]],
    ["string price", { name: "Milk", amount: 24, priceSatang: "25" }, ["priceSatang"]],
    ["price above maximum", { name: "Milk", amount: 24, priceSatang: 100000001 }, ["priceSatang"]],
  ])("PROD-C validation rejects %s", async (_caseName, body, fields) => {
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.post("/api/products").send(body);

    expectApiError(response, 422, "VALIDATION_ERROR", body);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining(fields.map((field) => expect.objectContaining({ field }))),
    );
    expect(rowCount(context, "products")).toBe(0);
  });

  it("PROD-C accepts zero and maximum amount and price values", async () => {
    const { agent } = await loginAsOwner(context.app);
    const zero = await agent.post("/api/products").send({
      name: "Z",
      amount: 0,
      priceSatang: 0,
    });
    const maximum = await agent.post("/api/products").send({
      name: "M".repeat(100),
      amount: 1000000,
      priceSatang: 100000000,
    });

    expect(zero.status).toBe(201);
    expect(maximum.status).toBe(201);
    expect(zero.body.product).toMatchObject({ amount: 0, priceSatang: 0 });
    expect(maximum.body.product).toMatchObject({
      name: "M".repeat(100),
      amount: 1000000,
      priceSatang: 100000000,
    });
  });

  it("PROD-C-9 rejects unknown fields without creating a product", async () => {
    const { agent } = await loginAsOwner(context.app);
    const body = {
      ...validProduct,
      id: 99,
    };
    const response = await agent.post("/api/products").send(body);

    expectApiError(response, 422, "VALIDATION_ERROR", body);
    expect(rowCount(context, "products")).toBe(0);
  });

  it("PROD-U-1 updates the name only and preserves other fields", async () => {
    const productId = seedProduct(context, validProduct);
    const before = productRow(context, productId)!;
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.patch(`/api/products/${productId}`).send({
      name: "Milk 2L",
    });

    expectSuccess(response, 200);
    expect(response.body.product).toMatchObject({
      id: productId,
      name: "Milk 2L",
      amount: before.amount,
      priceSatang: before.priceSatang,
    });
    expect(new Date(response.body.product.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(before.updatedAt).getTime(),
    );
  });

  it("PROD-U-2 sets the new stock amount exactly", async () => {
    const productId = seedProduct(context, validProduct);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.patch(`/api/products/${productId}`).send({ amount: 10 });

    expect(response.status).toBe(200);
    expect(response.body.product.amount).toBe(10);
    expect(productRow(context, productId)?.amount).toBe(10);
  });

  it("PROD-U-3 updates only the price", async () => {
    const productId = seedProduct(context, validProduct);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.patch(`/api/products/${productId}`).send({
      priceSatang: 3000,
    });

    expect(response.status).toBe(200);
    expect(response.body.product).toMatchObject({
      name: validProduct.name,
      amount: validProduct.amount,
      priceSatang: 3000,
    });
  });

  it("PROD-U-4 updates all editable fields together", async () => {
    const productId = seedProduct(context, validProduct);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.patch(`/api/products/${productId}`).send({
      name: "Milk 2L",
      amount: 5,
      priceSatang: 3500,
    });

    expect(response.status).toBe(200);
    expect(response.body.product).toMatchObject({
      id: productId,
      name: "Milk 2L",
      amount: 5,
      priceSatang: 3500,
    });
  });

  it.each([
    ["zero values", { amount: 0, priceSatang: 0 }],
    ["maximum values", { amount: 1000000, priceSatang: 100000000 }],
  ])("PROD-U accepts %s", async (_caseName, body) => {
    const productId = seedProduct(context, validProduct);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.patch(`/api/products/${productId}`).send(body);

    expect(response.status).toBe(200);
    expect(response.body.product).toMatchObject(body);
    expect(productRow(context, productId)).toMatchObject(body);
  });

  it("PROD-U-5 rejects an empty body", async () => {
    const productId = seedProduct(context, validProduct);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.patch(`/api/products/${productId}`).send({});

    expectApiError(response, 422, "VALIDATION_ERROR");
    expect(productRow(context, productId)).toMatchObject(validProduct);
  });

  it("PROD-U-6 rejects a case-insensitive duplicate name without changing the product", async () => {
    const productId = seedProduct(context, validProduct);
    seedProduct(context, { name: "Bread", amount: 5, priceSatang: 3000 });
    const { agent } = await loginAsOwner(context.app);
    const body = {
      name: "bREAD",
    };
    const response = await agent.patch(`/api/products/${productId}`).send(body);

    expectApiError(response, 409, "PRODUCT_NAME_EXISTS", body);
    expect(productRow(context, productId)).toMatchObject(validProduct);
  });

  it("PROD-U-7 allows a case-only change to the same product name", async () => {
    const productId = seedProduct(context, validProduct);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.patch(`/api/products/${productId}`).send({
      name: "MILK 1L",
    });

    expect(response.status).toBe(200);
    expect(response.body.product.name).toBe("MILK 1L");
  });

  it.each([
    ["empty name", { name: "" }, "name"],
    ["whitespace-only name", { name: "   " }, "name"],
    ["101-character name", { name: "n".repeat(101) }, "name"],
    ["non-string name", { name: 3 }, "name"],
    ["negative amount", { amount: -1 }, "amount"],
    ["fractional amount", { amount: 1.5 }, "amount"],
    ["string amount", { amount: "5" }, "amount"],
    ["amount over maximum", { amount: 1000001 }, "amount"],
    ["negative price", { priceSatang: -1 }, "priceSatang"],
    ["fractional price", { priceSatang: 1.5 }, "priceSatang"],
    ["string price", { priceSatang: "25" }, "priceSatang"],
    ["price over maximum", { priceSatang: 100000001 }, "priceSatang"],
  ])("PROD-U-8 rejects %s without changing the product", async (_caseName, body, field) => {
    const productId = seedProduct(context, validProduct);
    const before = productRow(context, productId);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.patch(`/api/products/${productId}`).send(body);

    expectApiError(response, 422, "VALIDATION_ERROR", body);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })]),
    );
    expect(productRow(context, productId)).toEqual(before);
  });

  it("PROD-U-9 rejects unknown fields without changing the product", async () => {
    const productId = seedProduct(context, validProduct);
    const before = productRow(context, productId);
    const { agent } = await loginAsOwner(context.app);
    const body = {
      name: "Changed",
      id: 99,
    };
    const response = await agent.patch(`/api/products/${productId}`).send(body);

    expectApiError(response, 422, "VALIDATION_ERROR", body);
    expect(productRow(context, productId)).toEqual(before);
  });

  it("PROD-U-10 returns not found for a well-formed unknown ID", async () => {
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.patch("/api/products/999").send({ name: "Milk" });
    expectApiError(response, 404, "PRODUCT_NOT_FOUND", {
      method: "PATCH",
      path: "/api/products/999",
      body: { name: "Milk" },
    });
  });

  it("PROD-U-11 preserves a sold item's historical name and price after a price update", async () => {
    const productId = seedProduct(context, validProduct);
    seedSale(context, [
      {
        productId,
        name: validProduct.name,
        unitPriceSatang: validProduct.priceSatang,
        quantity: 2,
      },
    ]);
    const { agent } = await loginAsOwner(context.app);
    const updateResponse = await agent
      .patch(`/api/products/${productId}`)
      .send({ priceSatang: 3000 });
    expect(updateResponse.status).toBe(200);

    const salesResponse = await agent.get("/api/sales?date=2026-11-15");
    expect(salesResponse.status).toBe(200);
    expect(salesResponse.body.items[0].items[0]).toMatchObject({
      productId,
      name: validProduct.name,
      unitPriceSatang: validProduct.priceSatang,
      lineTotalSatang: 5000,
    });
  });

  it.each(["abc", "0", "-1", "1.5"])(
    "G2 rejects PATCH /api/products/%s as a bad ID",
    async (id) => {
      const { agent } = await loginAsOwner(context.app);
      const response = await agent.patch(`/api/products/${id}`).send({ name: "Milk" });
      expectApiError(response, 400, "BAD_REQUEST");
    },
  );

  it("G3 rejects malformed JSON when updating a product", async () => {
    const productId = seedProduct(context, validProduct);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent
      .patch(`/api/products/${productId}`)
      .set("Content-Type", "application/json")
      .send('{"name":');
    expectApiError(response, 400, "BAD_REQUEST");
  });

  it("PROD-L-1 returns all products sorted by case-insensitive name and ID", async () => {
    seedProduct(context, { name: "Zebra", amount: 1, priceSatang: 1 });
    seedProduct(context, { name: "apple", amount: 1, priceSatang: 1 });
    seedProduct(context, { name: "Apricot", amount: 1, priceSatang: 1 });
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.get("/api/products");

    expectSuccess(response, 200);
    expect(response.body).toMatchObject({ total: 3, limit: 50, offset: 0 });
    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual([
      "apple",
      "Apricot",
      "Zebra",
    ]);
  });

  it("PROD-L-2 searches names without regard to case", async () => {
    seedProduct(context, { name: "Almond Milk", amount: 1, priceSatang: 1 });
    seedProduct(context, { name: "Bread", amount: 1, priceSatang: 1 });
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.get("/api/products?search=mIlK");

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual([
      "Almond Milk",
    ]);
  });

  it("PROD-L-3 numeric search includes matching IDs and names", async () => {
    const idMatch = seedProduct(context, { name: "Bread", amount: 1, priceSatang: 1 });
    const search = String(idMatch);
    const nameMatchId = seedProduct(context, {
      name: `Type ${search} Milk`,
      amount: 1,
      priceSatang: 1,
    });
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.get(`/api/products?search=${search}`);

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { id: number }) => item.id)).toEqual(
      expect.arrayContaining([idMatch, nameMatchId]),
    );
  });

  it("PROD-L-4 returns an empty result when search finds nothing", async () => {
    seedProduct(context, validProduct);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.get("/api/products?search=missing");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ items: [], total: 0 });
  });

  it("PROD-L-5 treats an empty search as no search", async () => {
    seedProduct(context, validProduct);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.get("/api/products?search=");

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items).toHaveLength(1);
  });

  it("PROD-L trims search whitespace before matching", async () => {
    seedProduct(context, { name: "Almond Milk", amount: 1, priceSatang: 1 });
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.get("/api/products?search=%20%20milk%20%20");

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].name).toBe("Almond Milk");
  });

  it.each(["%", "_"])("PROD-L-6 treats %s as a literal search character", async (term) => {
    seedProduct(context, { name: `Item ${term} Special`, amount: 1, priceSatang: 1 });
    seedProduct(context, { name: "Ordinary Item", amount: 1, priceSatang: 1 });
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.get(`/api/products?search=${encodeURIComponent(term)}`);

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].name).toBe(`Item ${term} Special`);
  });

  it("PROD-L-7 paginates results while reporting the total before pagination", async () => {
    for (const name of ["Alpha", "Bravo", "Charlie", "Delta", "Echo"]) {
      seedProduct(context, { name, amount: 1, priceSatang: 1 });
    }
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.get("/api/products?limit=2&offset=2");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 5, limit: 2, offset: 2 });
    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual([
      "Charlie",
      "Delta",
    ]);
  });

  it.each([
    ["limit zero", "limit=0"],
    ["limit above maximum", "limit=201"],
    ["negative offset", "offset=-1"],
    ["non-numeric limit", "limit=abc"],
    ["fractional limit", "limit=1.5"],
    ["non-numeric offset", "offset=abc"],
  ])("PROD-L-8 rejects %s", async (_caseName, query) => {
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.get(`/api/products?${query}`);
    expectApiError(response, 400, "BAD_REQUEST");
  });

  it("PROD-L accepts pagination boundary values", async () => {
    seedProduct(context, validProduct);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.get("/api/products?limit=200&offset=0");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 1, limit: 200, offset: 0 });
  });

  it("PROD-D-1 deletes an existing product with an empty 204 response", async () => {
    const productId = seedProduct(context, validProduct);
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.delete(`/api/products/${productId}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(productRow(context, productId)).toBeUndefined();
  });

  it.each([999, 1000])("PROD-D returns not found when deleting missing ID %s", async (id) => {
    const { agent } = await loginAsOwner(context.app);
    const response = await agent.delete(`/api/products/${id}`);
    expectApiError(response, 404, "PRODUCT_NOT_FOUND");
  });

  it.each(["abc", "0", "-1", "1.5"])(
    "G2 rejects DELETE /api/products/%s as a bad ID",
    async (id) => {
      const { agent } = await loginAsOwner(context.app);
      const response = await agent.delete(`/api/products/${id}`);
      expectApiError(response, 400, "BAD_REQUEST");
    },
  );

  it("PROD-D returns 404 when deleting the same product twice", async () => {
    const productId = seedProduct(context, validProduct);
    const { agent } = await loginAsOwner(context.app);
    expect((await agent.delete(`/api/products/${productId}`)).status).toBe(204);
    const secondDelete = await agent.delete(`/api/products/${productId}`);
    expectApiError(secondDelete, 404, "PRODUCT_NOT_FOUND");
  });

  it("PROD-D-4 preserves a sold item's historical snapshot after deleting the product", async () => {
    const productId = seedProduct(context, validProduct);
    seedSale(context, [
      {
        productId,
        name: validProduct.name,
        unitPriceSatang: validProduct.priceSatang,
        quantity: 1,
      },
    ]);
    const { agent } = await loginAsOwner(context.app);
    const deleteResponse = await agent.delete(`/api/products/${productId}`);

    expect(deleteResponse.status).toBe(204);
    const salesResponse = await agent.get("/api/sales?date=2026-11-15");
    expect(salesResponse.status).toBe(200);
    expect(salesResponse.body.items[0].items[0]).toMatchObject({
      productId,
      name: validProduct.name,
      unitPriceSatang: validProduct.priceSatang,
      lineTotalSatang: validProduct.priceSatang,
    });
  });
});
