# รายการโมเดลและโครงสร้างฐานข้อมูล

เอกสารนี้อธิบายโมเดล Drizzle ที่ประกาศอยู่ใน [`server/src/db/schema.ts`](./server/src/db/schema.ts) ปัจจุบันมี 5 ตาราง โดยชนิด TypeScript ของแต่ละโมเดลอนุมานจาก schema ด้วย `$inferSelect` และ `$inferInsert`

## ภาพรวม

| โมเดล TypeScript | ตาราง SQLite | หน้าที่ |
|---|---|---|
| `User` | `users` | บัญชีเจ้าของร้านและ password hash |
| `Session` | `sessions` | session ฝั่ง server ที่อ้างถึงผู้ใช้ |
| `Product` | `products` | สินค้า ราคา และจำนวนคงเหลือ |
| `Sale` | `sales` | หัวรายการขายและยอดรวม |
| `SaleItem` | `sale_items` | รายการสินค้าในใบขาย พร้อม snapshot สำหรับประวัติ |

## รายละเอียดโมเดล

### `User` — `users`

| Field ใน TypeScript | Column ใน SQLite | ชนิด | Null ได้ | ข้อกำหนด |
|---|---|---|---|---|
| `id` | `id` | `number` / `INTEGER` | ไม่ได้ | Primary key, auto-increment |
| `username` | `username` | `string` / `TEXT` | ไม่ได้ | Unique index |
| `passwordHash` | `password_hash` | `string` / `TEXT` | ไม่ได้ | เก็บ password hash เท่านั้น ห้ามเก็บรหัสผ่าน plain text |
| `createdAt` | `created_at` | `string` / `TEXT` | ไม่ได้ | เวลาสร้างบัญชี; แอปควรบันทึก ISO 8601 UTC |

Drizzle types: `User` สำหรับแถวที่อ่านได้ และ `NewUser` สำหรับข้อมูล insert

### `Session` — `sessions`

| Field ใน TypeScript | Column ใน SQLite | ชนิด | Null ได้ | ข้อกำหนด |
|---|---|---|---|---|
| `tokenHash` | `token_hash` | `string` / `TEXT` | ไม่ได้ | Primary key; เก็บ hash ของ opaque session token ไม่เก็บ token ดิบ |
| `userId` | `user_id` | `number` / `INTEGER` | ไม่ได้ | Foreign key ไป `users.id`; ลบ session เมื่อผู้ใช้ถูกลบ |
| `createdAt` | `created_at` | `string` / `TEXT` | ไม่ได้ | เวลาสร้าง session |
| `expiresAt` | `expires_at` | `string` / `TEXT` | ไม่ได้ | เวลาหมดอายุของ session |

มี index ที่ `userId` และความสัมพันธ์ `Session.user` / `User.sessions`

### `Product` — `products`

| Field ใน TypeScript | Column ใน SQLite | ชนิด | Null ได้ | ข้อกำหนด |
|---|---|---|---|---|
| `id` | `id` | `number` / `INTEGER` | ไม่ได้ | Primary key, auto-increment |
| `name` | `name` | `string` / `TEXT` | ไม่ได้ | Unique index โดยใช้ `lower(trim(name))` |
| `amount` | `amount` | `number` / `INTEGER` | ไม่ได้ | Check constraint: 0–1,000,000 |
| `priceSatang` | `price_satang` | `number` / `INTEGER` | ไม่ได้ | Check constraint: 0–100,000,000 สตางค์ |
| `createdAt` | `created_at` | `string` / `TEXT` | ไม่ได้ | เวลาสร้าง; แอปควรบันทึก ISO 8601 UTC |
| `updatedAt` | `updated_at` | `string` / `TEXT` | ไม่ได้ | เวลาแก้ไขล่าสุด; แอปควรบันทึก ISO 8601 UTC |

`amount` คือจำนวนคงเหลือ ไม่ใช่จำนวนการเปลี่ยนแปลง ส่วน `priceSatang` เป็นราคาสุดท้ายต่อหน่วยในหน่วยสตางค์ โมเดลนี้ไม่มี foreign key จาก `sale_items` เพื่อให้ลบสินค้าได้โดยไม่ทำให้ประวัติการขายหาย

### `Sale` — `sales`

| Field ใน TypeScript | Column ใน SQLite | ชนิด | Null ได้ | ข้อกำหนด |
|---|---|---|---|---|
| `id` | `id` | `number` / `INTEGER` | ไม่ได้ | Primary key, auto-increment |
| `totalSatang` | `total_satang` | `number` / `INTEGER` | ไม่ได้ | Check constraint: ต้องไม่น้อยกว่า 0 |
| `createdAt` | `created_at` | `string` / `TEXT` | ไม่ได้ | เวลาขาย; ใช้จัดกลุ่มตามวันในเขตเวลาร้าน |

มี index ที่ `createdAt` และความสัมพันธ์ `Sale.items` แบบหนึ่งต่อหลาย `Sale` เก็บหัวรายการเท่านั้น ส่วนรายการสินค้าอยู่ใน `sale_items`

### `SaleItem` — `sale_items`

| Field ใน TypeScript | Column ใน SQLite | ชนิด | Null ได้ | ข้อกำหนด |
|---|---|---|---|---|
| `id` | `id` | `number` / `INTEGER` | ไม่ได้ | Primary key, auto-increment |
| `saleId` | `sale_id` | `number` / `INTEGER` | ไม่ได้ | Foreign key ไป `sales.id`; ลบรายการย่อยเมื่อ sale ถูกลบ |
| `productId` | `product_id` | `number` / `INTEGER` | ไม่ได้ | เก็บ ID เดิมเพื่ออ้างอิงประวัติ; ไม่มี foreign key ไป `products` |
| `name` | `name` | `string` / `TEXT` | ไม่ได้ | Snapshot ชื่อสินค้าขณะขาย |
| `unitPriceSatang` | `unit_price_satang` | `number` / `INTEGER` | ไม่ได้ | Snapshot ราคาต่อหน่วยขณะขาย; ต้องไม่น้อยกว่า 0 |
| `quantity` | `quantity` | `number` / `INTEGER` | ไม่ได้ | จำนวนที่ขาย; ต้องมากกว่า 0 |
| `lineTotalSatang` | `line_total_satang` | `number` / `INTEGER` | ไม่ได้ | ยอดของบรรทัด; ต้องไม่น้อยกว่า 0 |

มี unique index ที่ `(saleId, productId)` เพื่อไม่ให้ sale เดียวมีสินค้าซ้ำหลายบรรทัด และมีความสัมพันธ์ `SaleItem.sale`

## ความสัมพันธ์

```text
User 1 ─── * Session
Sale 1 ─── * SaleItem
Product   (ไม่มี FK จาก SaleItem; SaleItem เก็บ ID, ชื่อ และราคาเป็น snapshot)
```

## ชนิดแถวที่ Drizzle สร้างให้

```ts
type User = typeof users.$inferSelect;
type NewUser = typeof users.$inferInsert;

type Session = typeof sessions.$inferSelect;
type NewSession = typeof sessions.$inferInsert;

type Product = typeof products.$inferSelect;
type NewProduct = typeof products.$inferInsert;

type Sale = typeof sales.$inferSelect;
type NewSale = typeof sales.$inferInsert;

type SaleItem = typeof saleItems.$inferSelect;
type NewSaleItem = typeof saleItems.$inferInsert;
```

`createDatabase()` ส่ง schema ทั้งชุดให้ `drizzle(sqlite, { schema })` จึงเปิดใช้ typed relational queries เช่น `db.query.products` และ `db.query.sales` ได้

## ขอบเขตและสถานะ

- รายการนี้สะท้อนเฉพาะโมเดลที่ประกาศใน Drizzle ปัจจุบัน ไม่รวมโมเดลที่ API spec ระบุไว้นอก MVP เช่น ผู้จำหน่าย ลูกค้า การชำระเงิน และ inventory movement
- การประกาศ schema และส่งให้ Drizzle ช่วยเรื่อง type inference/IntelliSense แต่ยังไม่สร้างตารางในไฟล์ SQLite โดยอัตโนมัติ ต้องเพิ่ม migration หรือขั้นตอนสร้างตารางก่อนใช้ query กับฐานข้อมูลจริง
- Field ไม่มีค่า default ใน schema ปัจจุบัน; ชั้น service ต้องกำหนดเวลาและค่าเริ่มต้นที่จำเป็นก่อน insert
