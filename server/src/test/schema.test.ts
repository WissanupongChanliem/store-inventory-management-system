import { describe, expect, it } from "@jest/globals";
import { createDatabase } from "../db";

describe("Drizzle schema registration", () => {
  it("exposes relational queries for the MVP tables", () => {
    const { db, close } = createDatabase(":memory:");

    try {
      expect(Object.keys(db.query)).toEqual(
        expect.arrayContaining(["users", "sessions", "products", "sales", "saleItems"]),
      );
    } finally {
      close();
    }
  });
});
