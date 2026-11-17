import bcrypt from "bcrypt";
import { expect } from "@jest/globals";
import request, { type Response } from "supertest";
import { createApp } from "../app";
import { createDatabase } from "../db";

export const TEST_OWNER = {
  username: "test-owner",
  password: "Test Owner Password 123!",
};

const testOwnerPasswordHash = bcrypt.hashSync(TEST_OWNER.password, 10);

const schemaSql = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX users_username_unique ON users(username);
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user_id_index ON sessions(user_id);
  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount BETWEEN 0 AND 1000000),
    price_satang INTEGER NOT NULL CHECK (price_satang BETWEEN 0 AND 100000000),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX products_name_case_insensitive_unique
    ON products(lower(trim(name)));
  CREATE TABLE sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_satang INTEGER NOT NULL CHECK (total_satang >= 0),
    created_at TEXT NOT NULL
  );
  CREATE INDEX sales_created_at_index ON sales(created_at);
  CREATE TABLE sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    unit_price_satang INTEGER NOT NULL CHECK (unit_price_satang >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    line_total_satang INTEGER NOT NULL CHECK (line_total_satang >= 0)
  );
  CREATE UNIQUE INDEX sale_items_sale_product_unique
    ON sale_items(sale_id, product_id);
`;

export type TestContext = ReturnType<typeof createTestApp>;

export type ProductSeed = {
  name: string;
  amount: number;
  priceSatang: number;
  createdAt?: string;
  updatedAt?: string;
};

export type SaleItemSeed = {
  productId: number;
  name: string;
  unitPriceSatang: number;
  quantity: number;
};

export function createTestApp() {
  const previousTimezone = process.env.STORE_TIMEZONE;
  process.env.STORE_TIMEZONE = "Asia/Bangkok";

  const database = createDatabase(":memory:");
  database.db.$client.exec(schemaSql);

  const createdAt = "2026-11-15T03:00:00.000Z";
  const owner = database.db.$client
    .prepare(
      "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
    )
    .run(TEST_OWNER.username, testOwnerPasswordHash, createdAt);
  const ownerId = Number(owner.lastInsertRowid);

  return {
    app: createApp({ db: database.db }),
    db: database.db,
    ownerId,
    closeDatabase: () => {
      database.close();
      if (previousTimezone === undefined) {
        delete process.env.STORE_TIMEZONE;
      } else {
        process.env.STORE_TIMEZONE = previousTimezone;
      }
    },
  };
}

export function resetTestData(context: TestContext) {
  context.db.$client.exec(`
    DELETE FROM sale_items;
    DELETE FROM sales;
    DELETE FROM sessions;
    DELETE FROM products;
    DROP TRIGGER IF EXISTS fail_sale_item_insert;
  `);

  context.db.$client
    .prepare(
      `UPDATE users
       SET username = ?, password_hash = ?, created_at = ?
       WHERE id = ?`,
    )
    .run(
      TEST_OWNER.username,
      testOwnerPasswordHash,
      "2026-11-15T03:00:00.000Z",
      context.ownerId,
    );
}

export async function loginAsOwner(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/login").send(TEST_OWNER);
  expect(response.status).toBe(200);
  expectTopLevel(response);
  return { agent, response };
}

export function sendMalformedJson(
  app: ReturnType<typeof createApp>,
  method: "get" | "post" | "patch" | "delete",
  path: string,
) {
  return request(app)
    [method](path)
    .set("Content-Type", "application/json")
    .send('{"malformed":');
}

export function seedProduct(
  context: TestContext,
  product: ProductSeed,
): number {
  const createdAt = product.createdAt ?? "2026-11-15T03:00:00.000Z";
  const updatedAt = product.updatedAt ?? createdAt;
  const result = context.db.$client
    .prepare(
      `INSERT INTO products (name, amount, price_satang, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      product.name,
      product.amount,
      product.priceSatang,
      createdAt,
      updatedAt,
    );
  return Number(result.lastInsertRowid);
}

export function seedSale(
  context: TestContext,
  items: SaleItemSeed[],
  createdAt = "2026-11-15T03:20:00.000Z",
) {
  const totalSatang = items.reduce(
    (total, item) => total + item.unitPriceSatang * item.quantity,
    0,
  );
  const saleResult = context.db.$client
    .prepare("INSERT INTO sales (total_satang, created_at) VALUES (?, ?)")
    .run(totalSatang, createdAt);
  const saleId = Number(saleResult.lastInsertRowid);
  const insertItem = context.db.$client.prepare(
    `INSERT INTO sale_items
      (sale_id, product_id, name, unit_price_satang, quantity, line_total_satang)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  for (const item of items) {
    insertItem.run(
      saleId,
      item.productId,
      item.name,
      item.unitPriceSatang,
      item.quantity,
      item.unitPriceSatang * item.quantity,
    );
  }

  return saleId;
}

export function productRow(context: TestContext, productId: number) {
  return context.db.$client
    .prepare(
      `SELECT id, name, amount, price_satang AS priceSatang,
              created_at AS createdAt, updated_at AS updatedAt
       FROM products WHERE id = ?`,
    )
    .get(productId) as
    | {
        id: number;
        name: string;
        amount: number;
        priceSatang: number;
        createdAt: string;
        updatedAt: string;
      }
    | undefined;
}

export function rowCount(
  context: TestContext,
  table: "products" | "sales" | "sale_items",
) {
  const result = context.db.$client
    .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
    .get() as { count: number };
  return result.count;
}

export function expectApiError(
  response: Response,
  status: number,
  code?: string,
) {
  expect(response.status).toBe(status);
  expect(response.body.error).toEqual(
    expect.objectContaining({
      code: code ?? expect.any(String),
      message: expect.any(String),
    }),
  );
  expect(response.body).not.toHaveProperty("data");
  if (code === "VALIDATION_ERROR" || code === "INSUFFICIENT_STOCK") {
    expect(Array.isArray(response.body.error.details)).toBe(true);
  }
  if (code && code !== "VALIDATION_ERROR" && code !== "INSUFFICIENT_STOCK") {
    expect(response.body.error).not.toHaveProperty("details");
  }
  const serialized = JSON.stringify(response.body);
  expect(serialized).not.toMatch(/password_hash|passwordHash|stack|SQLITE_/i);
  expect(serialized).not.toMatch(/\b(?:select|insert|update|delete)\b.+\bfrom\b/i);
}

function isDiagnosticRow(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatDiagnosticTable(
  name: string,
  columns: string[],
  rows: unknown[],
) {
  const values = rows.length
    ? rows.map((row) =>
        columns.map((column) =>
          String((isDiagnosticRow(row) ? row[column] : "") ?? "")
            .replace(/\r?\n/g, "\\n")
            .replace(/\|/g, "\\|"),
        ),
      )
    : [["(no rows)", ...columns.slice(1).map(() => "")]];
  const widths = columns.map((column, index) =>
    Math.max(column.length, ...values.map((row) => row[index].length)),
  );
  const border = `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`;
  const formatRow = (row: string[]) =>
    `| ${row.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;

  return [
    name,
    border,
    formatRow(columns),
    border,
    ...values.map(formatRow),
    border,
  ].join("\n");
}

function formatDatabaseState(context: TestContext) {
  const database = context.db.$client;

  return [
    formatDiagnosticTable(
      "users",
      ["id", "username", "createdAt"],
      database
        .prepare("SELECT id, username, created_at AS createdAt FROM users ORDER BY id")
        .all(),
    ),
    formatDiagnosticTable(
      "sessions",
      ["userId", "username", "createdAt", "expiresAt"],
      database
        .prepare(
          `SELECT user_id AS userId, username, created_at AS createdAt,
                  expires_at AS expiresAt
           FROM sessions ORDER BY user_id, created_at`,
        )
        .all(),
    ),
    formatDiagnosticTable(
      "products",
      ["id", "name", "amount", "priceSatang", "createdAt", "updatedAt"],
      database
        .prepare(
          `SELECT id, name, amount, price_satang AS priceSatang,
                  created_at AS createdAt, updated_at AS updatedAt
           FROM products ORDER BY id`,
        )
        .all(),
    ),
    formatDiagnosticTable(
      "sales",
      ["id", "totalSatang", "createdAt"],
      database
        .prepare(
          `SELECT id, total_satang AS totalSatang, created_at AS createdAt
           FROM sales ORDER BY id`,
        )
        .all(),
    ),
    formatDiagnosticTable(
      "saleItems",
      [
        "id",
        "saleId",
        "productId",
        "name",
        "unitPriceSatang",
        "quantity",
        "lineTotalSatang",
      ],
      database
        .prepare(
          `SELECT id, sale_id AS saleId, product_id AS productId, name,
                  unit_price_satang AS unitPriceSatang, quantity,
                  line_total_satang AS lineTotalSatang
           FROM sale_items ORDER BY id`,
        )
        .all(),
    ),
  ].join("\n\n");
}

export function createApiErrorReporter(getContext: () => TestContext) {
  return (
    response: Response,
    status: number,
    code?: string,
    requestInput?: unknown,
  ) => {
    try {
      expectApiError(response, status, code);
    } catch (error) {
      const apiError = response.body?.error;
      const responseText = response.text ?? "";
      const htmlMessage = responseText.match(/<pre>([\s\S]*?)<\/pre>/i)?.[1];
      const fallbackMessage = (htmlMessage ?? responseText)
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const responseMessageCandidate =
        apiError?.message ??
        response.body?.message ??
        fallbackMessage;
      const responseMessage =
        typeof responseMessageCandidate === "string" &&
        responseMessageCandidate.length <= 500 &&
        !/stack|SQLITE_|password_hash|passwordHash|(?:^|\s)at\s+\S+/i.test(
          responseMessageCandidate,
        )
          ? responseMessageCandidate
          : "(no safe API message in response)";
      const context = getContext();
      const diagnostics = [
        `Test: ${expect.getState().currentTestName ?? "(unknown)"}`,
        `API response: ${JSON.stringify(
          {
            status: response.status,
            code: apiError?.code ?? response.body?.code,
            message: responseMessage,
            details: apiError?.details,
          },
          null,
          2,
        )}`,
        `Request input: ${JSON.stringify(requestInput ?? "(not provided)", null, 2)}`,
        `Database state:\n${formatDatabaseState(context)}`,
      ].join("\n\n");

      if (error instanceof Error) {
        error.message = `${error.message}\n\n${diagnostics}`;
        error.stack = undefined;
        throw error;
      }
      const diagnosticError = new Error(`${String(error)}\n\n${diagnostics}`);
      diagnosticError.stack = undefined;
      throw diagnosticError;
    }
  };
}

export function expectTopLevel(response: Response) {
  expect(response.body).toBeDefined();
  expect(response.body).not.toHaveProperty("data");
}

export function expectSuccess(response: Response, status: number) {
  expect(response.status).toBe(status);
  if (status !== 204) {
    expectTopLevel(response);
  }
}

export function expectValidProductTimestamps(product: Record<string, unknown>) {
  for (const field of ["createdAt", "updatedAt"]) {
    const value = product[field];
    expect(typeof value).toBe("string");
    expect(value).toMatch(/Z$/);
    expect(new Date(value as string).toISOString()).toBe(value);
  }
}

export function setCookiePair(response: Response) {
  const setCookie = response.headers["set-cookie"];
  expect(setCookie).toBeDefined();
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const sessionCookie = cookies.find((cookie) => cookie.startsWith("sid="));
  expect(sessionCookie).toBeDefined();
  return sessionCookie!.split(";")[0];
}

export function expectSessionCookieCleared(response: Response) {
  const setCookie = response.headers["set-cookie"];
  expect(setCookie).toBeDefined();
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const sessionCookie = cookies.find((cookie) => cookie.startsWith("sid="));
  expect(sessionCookie).toBeDefined();
  expect(sessionCookie).toMatch(/^sid=;/);
  expect(sessionCookie).toMatch(/(?:max-age=0|expires=Thu, 01 Jan 1970)/i);
}

