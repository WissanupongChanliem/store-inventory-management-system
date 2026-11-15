# API Specification — ระบบจัดการร้านค้า (Store Management)

เอกสารนี้เรียบเรียงจาก `api-service-contracts.md` และ `plan.md` ใหม่ ให้เปิดอ่านทีละ endpoint แล้วเขียน test ได้ทันที: แต่ละ endpoint บอกว่าใครเรียกได้ ส่งอะไร ได้อะไรกลับ และมีตาราง test case พร้อมผลที่คาดหวัง

เครื่องหมาย **⚠G#** คือจุดที่สัญญาเดิม *ไม่ได้ระบุหรือกำกวม* — เอกสารนี้ไม่เดาแทน ให้ดูรายการ G1–G18 ท้ายเอกสาร และตกลงกับทีมก่อนเขียน assertion ในจุดนั้น

## 1. อ่านเอกสารนี้อย่างไร

ทุก endpoint มีรูปแบบเดียวกัน:

1. **สิทธิ์ / Header** — ใครเรียกได้ และต้องส่ง header อะไร
2. **Request** — ตัวอย่าง body หรือ query พร้อมหมายเหตุ field
3. **Response สำเร็จ** — status และสิ่งที่ควร assert
4. **Test cases** — ตาราง `ID | สถานการณ์ | คาดหวัง` ตั้งชื่อ test ตาม ID ได้เลย (เช่น `CO-7`)

นอกจากตารางเฉพาะ endpoint แล้ว **ทุก endpoint ต้องผ่านชุดทดสอบกลาง C1–C9 ใน §3 ด้วย** จึงไม่เขียนซ้ำในแต่ละ endpoint (เว้นแต่มีข้อยกเว้น)

## 2. กติกากลาง

| เรื่อง | กติกา |
| --- | --- |
| Base path | ทุก endpoint ขึ้นต้น `/api` รับ-ส่ง JSON (API พอร์ต 3000 เป็นค่าที่เสนอ, client dev 5173) |
| ยืนยันตัวตน | Session cookie (`HttpOnly`, `SameSite`; `Secure` ใน production) จาก `POST /api/auth/login` — ทุก endpoint ต้องใช้ ยกเว้น `GET /api/health` และ `POST /api/auth/login` |
| CSRF | คำขอที่เปลี่ยนข้อมูล (POST/PUT/PATCH/DELETE) ต้องมี header `X-CSRF-Token` ที่ได้จาก `login` หรือ `GET /api/auth/me`; `login` ใช้การตรวจ Origin แทน |
| Idempotency | `POST /api/checkout` และ `POST /api/purchase-orders/{orderId}/receipts` ต้องมี header `Idempotency-Key` |
| เงิน | จำนวนเต็มหน่วยสตางค์ (field ลงท้าย `Satang`) ไม่มีภาษีในระบบ — ราคาสินค้าคือราคาสุดท้าย |
| เวลา | ISO 8601 UTC เช่น `2026-11-15T10:00:00.000Z`; query วันที่ใช้ `YYYY-MM-DD` |
| Path parameter | จำนวนเต็มบวก |
| แบ่งหน้า | `limit` (ตัวอย่างค่าเริ่มต้น 25) และ `cursor` แบบ opaque ⚠G4 |

**รูปแบบ response**

- สำเร็จ (รายการเดียว): `{ "data": { ... } }` — ไม่มี `meta`
- สำเร็จ (รายการหลายตัว): `{ "data": { "items": [...] }, "meta": { "pagination": { "limit": 25, "nextCursor": null, "hasMore": false } } }`
- ผิดพลาด: `{ "error": { "code": "...", "message": "...", "details": [ { "field": "quantity", "code": "MUST_BE_POSITIVE", "message": "..." } ], "requestId": "req_..." } }` — `details` ละได้ แต่ `requestId` ต้องมีเสมอ

**ข้อสมมติเรื่อง status ที่เอกสารนี้ใช้ (ยืนยันกับทีม ⚠G1)**

- JSON พัง / path หรือ query ผิดรูป → `400 BAD_REQUEST`
- body เป็น JSON ถูกต้องแต่ field ขาด ชนิดผิด หรือค่าผิดกฎ → `422 VALIDATION_ERROR` พร้อม `details[]` ชี้ field ที่ผิด
- ถ้า endpoint ไม่ได้ลิสต์ `422 VALIDATION_ERROR` ไว้ในสัญญา (เช่น login, checkout, DELETE cart, GET ทั้งหมด) ให้ใช้ `400`
- กฎธุรกิจใช้รหัสตามที่แต่ละ endpoint ระบุ — สังเกตว่า `INSUFFICIENT_STOCK` เป็น **409** ที่ adjustment แต่เป็น **422** ที่ cart/checkout

## 3. ชุดทดสอบกลาง (ทำกับทุก endpoint)

| ID | ใช้กับ | สถานการณ์ | คาดหวัง |
| --- | --- | --- | --- |
| C1 | ทุก endpoint ยกเว้น health, login | ไม่ส่ง cookie / cookie มั่ว / ใช้ cookie หลัง logout | `401 UNAUTHENTICATED` |
| C2 | ทุกคำขอที่เปลี่ยนข้อมูล ยกเว้น login | ไม่ส่ง หรือส่ง `X-CSRF-Token` ผิด | `403 CSRF_FAILED` และข้อมูลไม่เปลี่ยน |
| C3 | endpoint ที่จำกัด role (ดู §5) | login ด้วยบัญชี cashier-only | `403 FORBIDDEN` และข้อมูลไม่เปลี่ยน; บัญชี dual-role ต้องผ่าน |
| C4 | endpoint ที่มี `{id}` | id เป็น `abc`, `0`, `-1`, `1.5` | `400 BAD_REQUEST` |
| C5 | endpoint ที่มี body | JSON พัง / `Content-Type: text/plain` | `400 BAD_REQUEST` / `415 UNSUPPORTED_MEDIA_TYPE` |
| C6 | endpoint ที่มี body | body ใหญ่เกินขีดจำกัด | `413 PAYLOAD_TOO_LARGE` (ขีดจำกัดไม่ระบุ ⚠G5) |
| C7 | ทุก error response | ตรวจโครงสร้าง error | มี `error.code`, `error.message`, `error.requestId`; ไม่มี stack trace, SQL, session secret, password hash |
| C8 | ทุก endpoint แบบรายการ | `limit=1` แล้วไล่ `nextCursor` จนจบ | ไม่ซ้ำ ไม่ตกหล่น; `hasMore` กับ `nextCursor` สอดคล้องกัน; `limit`/`cursor` ผิดรูป → `400` (ข้อยกเว้น: loyalty ใช้ `data.entries` แทน `data.items`) |
| C9 | ทุก response สำเร็จ | ตรวจ envelope | มี `data`; รายการเดียวไม่มี `meta`; ไม่มี body ว่าง; field เงินเป็นจำนวนเต็ม; field เวลาเป็น ISO UTC |

ลำดับการตรวจเมื่อผิดหลายข้อพร้อมกัน (เช่น ไม่ login + body ผิด) สัญญาไม่ระบุ ⚠G2 — ให้ test แต่ละข้อแยกกัน โดยให้เงื่อนไขอื่นถูกต้องเสมอ

## 4. Fixtures ที่ควรมีก่อนรัน

- **ผู้ใช้:** `cashier1` (roles `["cashier"]`), `manager1` (`["manager"]`), `dual1` (`["cashier","manager"]`), `inactive1` (`active=false`) — รหัสผ่านอ่านจาก env ห้ามฝังใน repo (ตาม plan)
- **ฐานข้อมูล:** แยกต่อ test suite และ seed ผ่านสคริปต์ที่รันได้เฉพาะ non-production
- **สินค้า:** `P_normal` (id 42, ราคา 12500, stock 18, stampsPerUnit 2, reorderLevel 5), `P_low` (stock ไม่เกิน reorderLevel), `P_zero` (stock 0), `P_archived`
- **Supplier / PO:** supplier 1 ราย; PO สถานะ draft, partially\_received, cancelled
- **Register:** session เปิดอยู่ 1 อัน (ของ `cashier1`) และปิดแล้ว 1 อัน
- **Settings:** `maxDiscountPercent=100`, `stampValueSatangPerStamp=100` (ค่าจากตัวอย่างในสัญญา ⚠G16)
- **ลูกค้า:** `C_stamps40` (แต้ม 40), `C_zero` (แต้ม 0)

ตัวช่วยสำหรับ Jest + Supertest (ตาม plan):

```js
// tests/helpers/auth.js
const request = require('supertest');

async function loginAs(app, username, password) {
  const agent = request.agent(app); // เก็บ cookie ให้อัตโนมัติ
  const res = await agent.post('/api/auth/login').send({ username, password });
  return { agent, csrf: res.body.data.csrfToken, user: res.body.data.user };
}

// ใช้: agent.post('/api/products').set('X-CSRF-Token', csrf).send({ ... })
module.exports = { loginAs };
```

## 5. ตารางสิทธิ์

| กลุ่ม | Endpoint | ใครเรียกได้ |
| --- | --- | --- |
| สาธารณะ | `GET /health`, `POST /auth/login` | ทุกคน |
| ผู้ใช้ที่ login แล้ว | `POST /auth/logout`, `GET /auth/me` | ทุก role |
| **ผู้จัดการเท่านั้น** | `/users` (ทุก method), `POST`/`PATCH /products`, `archive`, `restore`, `/suppliers` (ทุก method), `/purchase-orders` (ทุก method รวม `receipts`), `POST /inventory/adjustments`, `GET /reports/{type}`, `/settings` (GET, PATCH) | manager หรือ dual-role |
| ไม่ระบุข้อจำกัด ⚠G3 | `GET /products`, `GET /inventory/movements`, `GET /inventory/low-stock`, `/cart/*`, `/register-sessions/*`, `POST /checkout`, `/customers/*` | staff ที่ login แล้ว (สัญญาไม่ลิสต์ `403` ไว้; checkout ระบุว่าแคชเชียร์หรือ dual-role) |
| จำกัดตามเจ้าของข้อมูล ⚠G12 | `GET /sales`, `GET /sales/{saleId}` | cashier เห็นของตน, manager เห็นทั้งหมด |

## 6. Endpoints

### 6.1 สถานะระบบและการยืนยันตัวตน

#### `GET /api/health`

**สิทธิ์:** สาธารณะ (ไม่ต้อง login) · **ชุดกลางที่ใช้:** C7, C9

**Response สำเร็จ:** `200` → `{ "data": { "status": "ok" } }`

| ID | สถานการณ์ | คาดหวัง |
| --- | --- | --- |
| HEALTH-1 | เรียกโดยไม่มี cookie | `200`, `data.status === "ok"` |
| HEALTH-2 | จำลองฐานข้อมูลไม่พร้อม | `503 SERVICE_UNAVAILABLE`; body ไม่เปิดเผย credential หรือรายละเอียดภายในของ DB |

#### `POST /api/auth/login`

**สิทธิ์:** สาธารณะ · **Header:** `Content-Type: application/json` · ไม่ต้องมี CSRF (ระบบตรวจ `Origin` แทน) · **ชุดกลางที่ใช้:** C5, C6, C7, C9

**Request:**

```json
{ "username": "cashier1", "password": "<อ่านจาก env>" }
```

**Response สำเร็จ:** `200` → `{ "data": { "user": User, "csrfToken": "csrf_..." } }` พร้อม `Set-Cookie` (`HttpOnly`, `SameSite`)

| ID | สถานการณ์ | คาดหวัง |
| --- | --- | --- |
| LOGIN-1 | username/password ถูกต้อง | `200`; `user.roles` ตรงกับ fixture; **ไม่มี** `password`/`passwordHash` ใน body; `Set-Cookie` มี `HttpOnly` และ `SameSite` |
| LOGIN-2 | นำ `csrfToken` ที่ได้ไปเรียก mutation ใด ๆ | ไม่ได้ `CSRF_FAILED` |
| LOGIN-3 | password ผิด | `401 INVALID_CREDENTIALS` |
| LOGIN-4 | username ไม่มีในระบบ | `401 INVALID_CREDENTIALS` — `code` และ `message` ต้องเหมือน LOGIN-3 ทุกตัวอักษร (กัน user enumeration) |
| LOGIN-5 | ขาด `username` หรือ `password` / ชนิดไม่ใช่ string | `400 BAD_REQUEST` |
| LOGIN-6 | ส่ง `Origin` ที่ไม่อนุญาต | `403 ORIGIN_FORBIDDEN` |
| LOGIN-7 | login ผิดซ้ำเกินเกณฑ์ | `429 RATE_LIMITED` ⚠G13 (เกณฑ์ไม่ระบุ) |
| LOGIN-8 | บัญชี `active=false` ใส่รหัสถูก | ⚠G13 สัญญาไม่ระบุ (ที่คาด: `401 INVALID_CREDENTIALS`) |

#### `POST /api/auth/logout`

**สิทธิ์:** ผู้ใช้ที่ login แล้ว · **Header:** `X-CSRF-Token` · ไม่มี body · **ชุดกลางที่ใช้:** C2, C7, C9

**Response สำเร็จ:** `200` → `{ "data": { "loggedOut": true } }` และล้าง session cookie

| ID | สถานการณ์ | คาดหวัง |
| --- | --- | --- |
| LOGOUT-1 | logout ปกติ | `200`, `loggedOut === true`; `Set-Cookie` ล้าง/ทำให้ cookie หมดอายุ |
| LOGOUT-2 | หลัง logout เรียก `GET /api/auth/me` ด้วย cookie เดิม | `401 UNAUTHENTICATED` |
| LOGOUT-3 | logout ซ้ำ | `200` (สัญญาระบุว่าเรียกซ้ำยังตอบ 200) ⚠G13 ไม่ระบุว่าซ้ำโดยไม่มี session/CSRF ที่ถูกต้องจะได้อะไร |
| LOGOUT-4 | ไม่ส่ง `X-CSRF-Token` | `403 CSRF_FAILED`; session ยังใช้งานได้ |

> สัญญาของ logout ไม่ลิสต์ `401` — จึงไม่ใช้ C1 กับ endpoint นี้

#### `GET /api/auth/me`

**สิทธิ์:** ผู้ใช้ที่ login แล้ว · **ชุดกลางที่ใช้:** C1, C7, C9

**Response สำเร็จ:** `200` → `{ "data": { "user": User, "csrfToken": "csrf_..." } }`

| ID | สถานการณ์ | คาดหวัง |
| --- | --- | --- |
| ME-1 | login แล้วเรียก | `200`; `user.id`/`username`/`roles` ตรงกับตอน login; `csrfToken` เป็น string ไม่ว่าง |
| ME-2 | ตรวจความลับ | body ไม่มี password hash และไม่มีตัวระบุ session (session อยู่ใน cookie เท่านั้น) |
| ME-3 | ผู้ใช้ถูก deactivate ขณะ session ยังไม่หมดอายุ | ⚠G13 ไม่ระบุ |

### 6.2 ผู้ใช้ (ผู้จัดการเท่านั้น)

#### `GET /api/users`

**Query:** `limit`, `cursor` · **ชุดกลางที่ใช้:** C1, C3, C7, C8, C9

**Response สำเร็จ:** `200` → `data.items: User[]` + `meta.pagination`

| ID | สถานการณ์ | คาดหวัง |
| --- | --- | --- |
| USR-L-1 | manager เรียก | `200`; มีผู้ใช้ทุกคนใน fixture; ทุก item มี `id, username, roles, active, createdAt` |
| USR-L-2 | ตรวจความลับ | ไม่มี `password`/`passwordHash` ใน item ใดเลย |

#### `POST /api/users`

**Header:** `X-CSRF-Token` · **ชุดกลางที่ใช้:** C1–C7, C9

**Request:**

```json
{ "username": "cashier2", "password": "<อ่านจาก env>", "roles": ["cashier"], "active": true }
```

**Response สำเร็จ:** `201` → `{ "data": { "user": User } }`

| ID | สถานการณ์ | คาดหวัง |
| --- | --- | --- |
| USR-C-1 | สร้างบัญชี cashier | `201`; `user.id` เป็นเลขบวก; `roles === ["cashier"]`; `active === true`; ไม่มี password/hash ใน body; บัญชีใหม่ login ได้และเรียก endpoint ของผู้จัดการไม่ได้ (`403`) |
| USR-C-2 | `roles: ["cashier","manager"]` | `201`; บัญชีนี้ใช้ได้ทั้งงานแคชเชียร์และงานผู้จัดการ |
| USR-C-3 | `username` ซ้ำกับที่มีอยู่ | `409 USERNAME_EXISTS` ⚠G5 (ไม่ระบุว่าแยกตัวพิมพ์เล็ก/ใหญ่หรือไม่) |
| USR-C-4 | ขาด field / ชนิดผิด / `roles` ว่าง / `roles` มีค่าที่ไม่ใช่ cashier,manager | `422 VALIDATION_ERROR`; `details[].field` ชี้ field ที่ผิด ⚠G5 (กฎ password/username ไม่ระบุ) |
| USR-C-5 | หลังสร้างสำเร็จ | มี audit event ของการสร้างบัญชี (ตรวจในฐานข้อมูล — ไม่มี API อ่าน audit ⚠G15) |

#### `PATCH /api/users/{userId}`

**Header:** `X-CSRF-Token` · **ชุดกลางที่ใช้:** C1–C7, C9

**Request** (ส่งเฉพาะ field ที่แก้): `{ "roles": ["cashier","manager"], "active": true }`

**Response สำเร็จ:** `200` → `{ "data": { "user": User } }`

| ID | สถานการณ์ | คาดหวัง |
| --- | --- | --- |
| USR-U-1 | แก้ `roles` อย่างเดียว | `200`; `roles` ใหม่; `active` และ field อื่นไม่เปลี่ยน |
| USR-U-2 | `active: false` กับบัญชี cashier | `200`; `active === false`; บัญชีนั้น login ไม่ได้ต่อ (นัยจาก REQ-011 ⚠G13) |
| USR-U-3 | `userId` ไม่มีในระบบ | `404 USER_NOT_FOUND` |
| USR-U-4 | ปิดบัญชี หรือถอด role manager ของผู้จัดการ active คนสุดท้าย | `409 LAST_ACTIVE_MANAGER`; ข้อมูลไม่เปลี่ยน |
| USR-U-5 | manager ปิดบัญชี/ถอด role manager ของตัวเอง | `409 SELF_LOCKOUT`; ข้อมูลไม่เปลี่ยน (กรณีเข้าเงื่อนไขทั้ง U-4 และ U-5 พร้อมกันจะได้ code ไหน ⚠G2) |
| USR-U-6 | `roles` ค่าผิด / `active` ไม่ใช่ boolean | `422 VALIDATION_ERROR` |
| USR-U-7 | หลังแก้สำเร็จ | มี audit event ของการเปลี่ยนบัญชี ⚠G15 |

### 6.3 สินค้า

#### `GET /api/products`

**สิทธิ์:** staff ที่ login แล้ว ⚠G3 · **Query:** `search`, `status` (ค่าเริ่มต้น `active`), `limit`, `cursor` · **ชุดกลางที่ใช้:** C1, C7, C8, C9

**Response สำเร็จ:** `200` → `data.items: Product[]` + `meta.pagination`

| ID | สถานการณ์ | คาดหวัง |
| --- | --- | --- |
| PROD-L-1 | ไม่ส่ง `status` | คืนเฉพาะ `status === "active"` |
| PROD-L-2 | `status=archived` | คืนเฉพาะสินค้า archived ⚠G11 (ค่า status อื่น เช่น all ไม่ระบุ) |
| PROD-L-3 | `search` ด้วยชื่อ / `SKU-0042` / barcode / id | พบสินค้าที่ตรง ⚠G11 (ชื่อต้องตรงทั้งคำหรือค้นบางส่วนได้ ไม่ระบุ) |
| PROD-L-4 | `search` ที่ไม่มีสินค้าตรง | `200`, `items: []`, `hasMore: false` (ไม่ใช่ 404) |
| PROD-L-5 | `status` ค่าที่ไม่รู้จัก | `400 BAD_REQUEST` |
| PROD-L-6 | login ด้วย cashier-only | เรียกได้ `200` (checkout ต้องค้นสินค้า) |

#### `POST /api/products`

**สิทธิ์:** ผู้จัดการ · **Header:** `X-CSRF-Token` · **ชุดกลางที่ใช้:** C1–C7, C9

**Request:**

```json
{ "name": "ตัวอย่างสินค้า", "unitPriceSatang": 12500, "quantityOnHand": 18, "stampsPerUnit": 2, "reorderLevel": 5, "sku": "SKU-0042", "barcode": "8850000000042", "category": "อาหาร" }
```

หมายเหตุ field (จาก plan): `name` ต้องไม่ซ้ำ · `unitPriceSatang` เป็นจำนวนเต็มสตางค์ = ราคาสุดท้าย · `quantityOnHand`, `stampsPerUnit` ไม่ติดลบ · `sku`, `barcode`, `category` ไม่บังคับ (`sku`/`barcode` ต้องไม่ซ้ำ) · field ที่บังคับจริงและช่วงค่าสูงสุด ⚠G5

**Response สำเร็จ:** `201` → `{ "data": { "product": Product } }` โดย `status === "active"`

| ID | สถานการณ์ | คาดหวัง |
| --- | --- | --- |
| PROD-C-1 | ส่งครบทุก field | `201`; `product.id` เลขบวก; ค่าตรงกับที่ส่ง; `status === "active"`; `updatedAt` เป็น ISO UTC |
| PROD-C-2 | ส่งเฉพาะ field ขั้นต่ำ | `201` และ `GET /products?search=<ชื่อ>` เจอ ⚠G5 (field ขั้นต่ำไม่ระบุ) |
| PROD-C-3 | `name` ซ้ำกับสินค้าที่มี | `409 PRODUCT_NAME_EXISTS` |
| PROD-C-4 | `sku` ซ้ำ | `409 SKU_EXISTS` |
| PROD-C-5 | `barcode` ซ้ำ | ⚠G5 สัญญาไม่ลิสต์ code เฉพาะ (มีแต่ `PRODUCT_NAME_EXISTS` / `SKU_EXISTS`) |
| PROD-C-6 | `unitPriceSatang` ติดลบ / ทศนิยม / string; `quantityOnHand` หรือ `stampsPerUnit` ติดลบ; `name` ว่าง | `422 VALIDATION_ERROR`; `details[].field` ตรงกับ field ที่ผิด; ไม่มีสินค้าถูกสร้าง |
| PROD-C-7 | สร้างด้วย `quantityOnHand > 0` | ⚠G10 ไม่ระบุว่าต้องเกิด `InventoryMovement` เปิดยอดหรือไม่ |

#### `PATCH /api/products/{productId}`

**สิทธิ์:** ผู้จัดการ · **Header:** `X-CSRF-Token` · **ชุดกลางที่ใช้:** C1–C7, C9

**Request** (ส่งเฉพาะ field ที่แก้): `{ "unitPriceSatang": 13000, "reorderLevel": 6 }`

**Response สำเร็จ:** `200` → `{ "data": { "product": Product } }`

| ID | สถานการณ์ | คาดหวัง |
| --- | --- | --- |
| PROD-U-1 | แก้ราคาและ reorderLevel | `200`; สองค่านี้เปลี่ยน; field อื่นไม่เปลี่ยน |
| PROD-U-2 | แก้ราคาแล้วดูใบเสร็จที่ขายไปก่อนหน้า | ใบเสร็จเก่ายังเป็นราคาเดิม (snapshot) — ทดสอบร่วมกับ `GET /sales/{id}` |
| PROD-U-3 | หลังแก้ราคาสำเร็จ | มี audit event การเปลี่ยนราคา (REQ-011) ⚠G15 |
| PROD-U-4 | `productId` ไม่มี | `404 PRODUCT_NOT_FOUND` |
| PROD-U-5 | แก้ `name`/`sku` ให้ซ้ำกับสินค้าอื่น | `409 PRODUCT_NAME_EXISTS` / `409 SKU_EXISTS` (ส่งชื่อเดิมของตัวเองซ้ำต้องไม่ใช่ 409 ⚠G5) |
| PROD-U-6 | ค่าผิดรูป (ราคาติดลบ ฯลฯ) | `422 VALIDATION_ERROR` |
| PROD-U-7 | ส่ง `quantityOnHand` ใน PATCH | ⚠G10 สัญญาไม่ระบุว่ารับหรือเมิน (ปกติสต็อกควรเปลี่ยนผ่าน adjustment/receipt/sale) |

#### `POST /api/products/{productId}/archive`

**สิทธิ์:** ผู้จัดการ · **Header:** `X-CSRF-Token` · ไม่มี body · **ชุดกลางที่ใช้:** C1–C4, C7, C9

**Response สำเร็จ:** `200` → `{ "data": { "product": Product } }` โดย `status === "archived"`

| ID | สถานการณ์ | คาดหวัง |
| --- | --- | --- |
| ARCH-1 | archive สินค้า active | `200`, `status === "archived"` |
| ARCH-2 | หลัง archive: `GET /products` (ค่าเริ่มต้น) / `status=archived` | ไม่อยู่ในรายการ active / อยู่ในรายการ archived |
| ARCH-3 | หลัง archive: `PUT /cart/items/{id}` | `409 PRODUCT_ARCHIVED` |
| ARCH-4 | หลัง archive: เปิดใบเสร็จเก่าที่มีสินค้านี้ | ยังอ่านได้ครบ (ประวัติการขายยังอยู่) |
| ARCH-5 | archive ซ้ำ | `409 PRODUCT_ALREADY_ARCHIVED` |
| ARCH-6 | `productId` ไม่มี | `404 PRODUCT_NOT_FOUND` |

#### `POST /api/products/{productId}/restore`

**สิทธิ์:** ผู้จัดการ · **Header:** `X-CSRF-Token` · ไม่มี body · **ชุดกลางที่ใช้:** C1–C4, C7, C9

**Response สำเร็จ:** `200` → `{ "data": { "product": Product } }` โดย `status === "active"`

| ID | สถานการณ์ | คาดหวัง |
| --- | --- | --- |
| REST-1 | restore สินค้า archived | `200`, `status === "active"`; กลับมาอยู่ในรายการ active; เพิ่มลงตะกร้าได้อีก |
| REST-2 | restore สินค้าที่ active อยู่แล้ว | `409 PRODUCT_ALREADY_ACTIVE` |
| REST-3 | ชื่อ/SKU ชนกับสินค้า active อื่นขณะ restore | `409` (สัญญาระบุแค่ "ข้อมูลซ้ำ") ⚠G5 ว่า code ใด |
| REST-4 | `productId` ไม่มี | `404 PRODUCT_NOT_FOUND` |

### 6.4 ผู้จำหน่าย (ผู้จัดการเท่านั้น)

#### `GET /api/suppliers`

**Query:** `limit`, `cursor` · **ชุดกลางที่ใช้:** C1, C3, C7, C8, C9

**Response สำเร็จ:** `200` → `data.items: Supplier[]` + `meta.pagination`

| ID | สถานการณ์ | คาดหวัง |
| --- | --- | --- |
| SUP-L-1 | manager เรียก | `200`; ทุก item มี `id, name, contactName, phone, email, active` (`email` เป็น `null` ได้) |

#### `POST /api/suppliers`

**Header:** `X-CSRF-Token` · **ชุดกลางที่ใช้:** C1–C7, C9

**Request:** `{ "name": "ผู้จำหน่ายตัวอย่าง", "contactName": "ชื่อผู้ติดต่อ", "phone": "020000000", "email": null }`

**Response สำเร็จ:** `201` → `{ "data": { "supplier": Supplier } }`

| ID | สถานการณ์ | คาดหวัง |
| --- | --- | --- |
| SUP-C-1 | ส่งครบ (email เป็น null) | `201`; `supplier.id` เลขบวก; `active === true` ⚠G5 (ค่าเริ่มต้นของ `active` ไม่ระบุชัด) |
| SUP-C-2 | ชื่อซ้ำ | `409 SUPPLIER_EXISTS` ⚠G5 (เกณฑ์ "ซ้ำ" ไม่ระบุ) |
| SUP-C-3 | ขาด field / ชนิดผิด | `422 VALIDATION_ERROR` |

#### `PATCH /api/suppliers/{supplierId}`

**Header:** `X-CSRF-Token` · **ชุดกลางที่ใช้:** C1–C7, C9

**Request:** `{ "phone": "021111111", "active": true }`

**Response สำเร็จ:** `200` → `{ "data": { "supplier": Supplier } }`

| ID | สถานการณ์ | คาดหวัง |
| --- | --- | --- |
| SUP-U-1 | แก้ `phone` อย่างเดียว | `200`; `phone` ใหม่; field อื่นไม่เปลี่ยน |
| SUP-U-2 | `active: false` | `200`; PO เดิมของ supplier นี้ยังอ่านได้ ⚠G18 (การสร้าง PO ใหม่กับ supplier ที่ inactive ไม่ระบุ) |
| SUP-U-3 | `supplierId` ไม่มี | `404 SUPPLIER_NOT_FOUND` |
| SUP-U-4 | แก้ให้ชนกับ supplier อื่น | `409 SUPPLIER_CONFLICT` ⚠G5 (เงื่อนไขชน ไม่ระบุ) |
| SUP-U-5 | ค่าผิดรูป | `422 VALIDATION_ERROR` |
