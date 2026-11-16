import bcrypt from "bcrypt";
import path from "node:path";
import dotenv from "dotenv";
import { createDatabase } from "./index";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const starterProducts = [
  { name: "Coffee Beans 250g", amount: 20, priceSatang: 15900 },
  { name: "Green Tea", amount: 30, priceSatang: 4500 },
  { name: "Milk 1L", amount: 24, priceSatang: 2500 },
  { name: "Rice 5kg", amount: 15, priceSatang: 18900 },
  { name: "Chocolate Bar", amount: 40, priceSatang: 3500 },
];

const schemaSql = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username);
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user_id_index ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount BETWEEN 0 AND 1000000),
    price_satang INTEGER NOT NULL CHECK (price_satang BETWEEN 0 AND 100000000),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS products_name_case_insensitive_unique
    ON products(lower(trim(name)));
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_satang INTEGER NOT NULL CHECK (total_satang >= 0),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sales_created_at_index ON sales(created_at);
  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    unit_price_satang INTEGER NOT NULL CHECK (unit_price_satang >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    line_total_satang INTEGER NOT NULL CHECK (line_total_satang >= 0)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS sale_items_sale_product_unique
    ON sale_items(sale_id, product_id);
`;

function seed() {
  const username = (process.env.SEED_OWNER_USERNAME || "owner").trim();
  const password = process.env.SEED_OWNER_PASSWORD;

  if (!username || username.length > 100) {
    throw new Error("SEED_OWNER_USERNAME must be 1 to 100 characters.");
  }
  if (!password || password.length < 12 || password.length > 128) {
    throw new Error(
      "Set SEED_OWNER_PASSWORD to a password between 12 and 128 characters.",
    );
  }

  const databaseUrl = process.env.DATABASE_URL || "./data/store.sqlite";
  const { db, close } = createDatabase(databaseUrl);

  try {
    const now = new Date().toISOString();
    const passwordHash = bcrypt.hashSync(password, 10);
    const insertSeedData = db.$client.transaction(() => {
      db.$client.exec(schemaSql);

      const ownerExists = db.$client
        .prepare("SELECT 1 FROM users WHERE username = ?")
        .get(username);
      if (!ownerExists) {
        db.$client
          .prepare(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
          )
          .run(username, passwordHash, now);
      }

      const findProduct = db.$client.prepare(
        "SELECT 1 FROM products WHERE lower(trim(name)) = lower(trim(?))",
      );
      const insertProduct = db.$client.prepare(
        `INSERT INTO products (name, amount, price_satang, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      let productsAdded = 0;

      for (const product of starterProducts) {
        if (!findProduct.get(product.name)) {
          insertProduct.run(
            product.name,
            product.amount,
            product.priceSatang,
            now,
            now,
          );
          productsAdded += 1;
        }
      }

      return { ownerAdded: !ownerExists, productsAdded };
    });

    const result = insertSeedData();
    console.log(
      `Seed complete: ${result.ownerAdded ? "created" : "kept"} owner "${username}", added ${result.productsAdded} products.`,
    );
  } finally {
    close();
  }
}

seed();
