import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("users_username_unique").on(table.username)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [index("sessions_user_id_index").on(table.userId)],
);

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    amount: integer("amount").notNull(),
    priceSatang: integer("price_satang").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("products_name_case_insensitive_unique").on(
      sql`lower(trim(${table.name}))`,
    ),
    check("products_amount_range_check", sql`${table.amount} BETWEEN 0 AND 1000000`),
    check(
      "products_price_satang_range_check",
      sql`${table.priceSatang} BETWEEN 0 AND 100000000`,
    ),
  ],
);

export const sales = sqliteTable(
  "sales",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    totalSatang: integer("total_satang").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check("sales_total_satang_nonnegative_check", sql`${table.totalSatang} >= 0`),
    index("sales_created_at_index").on(table.createdAt),
  ],
);

export const saleItems = sqliteTable(
  "sale_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    saleId: integer("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull(),
    name: text("name").notNull(),
    unitPriceSatang: integer("unit_price_satang").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalSatang: integer("line_total_satang").notNull(),
  },
  (table) => [
    uniqueIndex("sale_items_sale_product_unique").on(table.saleId, table.productId),
    check(
      "sale_items_unit_price_satang_nonnegative_check",
      sql`${table.unitPriceSatang} >= 0`,
    ),
    check("sale_items_quantity_positive_check", sql`${table.quantity} > 0`),
    check(
      "sale_items_line_total_satang_nonnegative_check",
      sql`${table.lineTotalSatang} >= 0`,
    ),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const salesRelations = relations(sales, ({ many }) => ({
  items: many(saleItems),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, {
    fields: [saleItems.saleId],
    references: [sales.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
export type SaleItem = typeof saleItems.$inferSelect;
export type NewSaleItem = typeof saleItems.$inferInsert;
