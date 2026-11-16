import { describe, expect, it } from "@jest/globals";
import { getTableColumns } from "drizzle-orm";
import { createDatabase, sessions } from "../db";

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

  it("includes the username on session records", () => {
    expect(getTableColumns(sessions)).toHaveProperty("username");
  });
});
