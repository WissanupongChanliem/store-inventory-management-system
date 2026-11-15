const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { drizzle } = require("drizzle-orm/better-sqlite3");

function createDatabase(databaseUrl) {
  const databasePath = databaseUrl === ":memory:" ? databaseUrl : path.resolve(databaseUrl);

  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");

  return {
    db: drizzle(sqlite),
    close: () => sqlite.close(),
  };
}

module.exports = { createDatabase };
