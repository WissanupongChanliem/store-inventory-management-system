import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export * from "./schema";
export type AppDatabase = BetterSQLite3Database<typeof schema>;

export function createDatabase(databaseUrl: string) {
  const databasePath = databaseUrl === ":memory:" ? databaseUrl : path.resolve(databaseUrl);

  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");

  return {
    db: drizzle(sqlite, { schema }),
    close: () => sqlite.close(),
  };
}
