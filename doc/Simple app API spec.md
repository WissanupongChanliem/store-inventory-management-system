# แอปร้านค้าแบบง่าย — ข้อกำหนด API

15 พฤศจิกายน 2026 · @Wissanupong

เอกสารนี้กำหนด API สำหรับเจ้าของคนเดียวที่ดูแลร้านเดียว: เข้าสู่ระบบ จัดการสินค้า ขายสินค้า และดูยอดขายรายวัน ฟีเจอร์ที่ไม่ได้ระบุไว้ในเอกสารนี้ถือว่านอกขอบเขต

## 1. ขอบเขต

| # | ฟีเจอร์ | Endpoint |
|---|---|---|
| 1 | เข้าสู่ระบบและแก้ข้อมูลบัญชีเจ้าของ | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `PATCH /api/auth/me` |
| 2 | เพิ่มสินค้า | `POST /api/products` |
| 3 | แก้ชื่อ จำนวนคงเหลือ และราคา | `PATCH /api/products/{id}` |
| 4 | ดูและค้นหาสินค้า | `GET /api/products` |
| 5 | ลบสินค้า | `DELETE /api/products/{id}` |
| 6 | ดูยอดขายรายวัน | `GET /api/sales?date=YYYY-MM-DD` |
| 7 | ชำระรายการขาย | `POST /api/checkout` |

### ขั้นตอนการขาย

1. แคชเชียร์ค้นหาสินค้าด้วย `GET /api/products?search=...` โดยค้นจากชื่อหรือรหัสสินค้า
2. Frontend เก็บตะกร้าไว้ในสถานะของเบราว์เซอร์ และแสดงยอดรวมระหว่างเลือกสินค้า
3. เมื่อกดชำระเงิน Frontend ส่งเฉพาะ `productId` และ `quantity` ของแต่ละรายการไปยัง `POST /api/checkout`
4. Server อ่านราคาและจำนวนคงเหลือปัจจุบันจากฐานข้อมูล คำนวณยอดรวม ตัดสต็อก และบันทึกการขายภายใน transaction เดียว

### ฟีเจอร์ที่ตั้งใจไม่รวม

ไม่รองรับผู้ใช้หรือบทบาทหลายระดับ, CSRF token, การเก็บถาวรสินค้า, ผู้จำหน่ายและการสั่งซื้อ, ลูกค้าและแต้มสะสม, ส่วนลด, จำนวนเงินที่รับและเงินทอน, การคืนเงิน, รายงานอื่น, idempotency key (Frontend ต้องปิดปุ่มชำระเงินระหว่างรอคำขอ) และ rate limit สำหรับการเข้าสู่ระบบ (ต้องเพิ่มก่อนเปิดให้เข้าถึงจากเครือข่ายภายนอก)

## 2. ข้อตกลงร่วม

| หัวข้อ | ข้อกำหนด |
|---|---|
| Base path | `/api`; รับและส่งข้อมูล JSON |
| การยืนยันตัวตน | ใช้ session cookie ที่มี `HttpOnly`, `SameSite=Lax` และ `Secure` เมื่อใช้ HTTPS ทุก endpoint ต้องมี session ยกเว้น `POST /api/auth/login`; MVP นี้ไม่ใช้ CSRF token |
| บัญชีเจ้าของร้าน | มีบัญชีเดียว สร้างด้วย setup script จาก environment variables `OWNER_USERNAME` และ `OWNER_PASSWORD`; บันทึกรหัสผ่านเป็น hash; เจ้าของแก้ username/password ของตนเองได้โดยยืนยันรหัสผ่านปัจจุบัน; ไม่มี endpoint สมัครสมาชิก |
| จำนวนเงิน | ใช้จำนวนเต็มหน่วยสตางค์ เช่น `priceSatang` และ `totalSatang`; `2500` หมายถึง 25.00 บาท; Frontend เป็นผู้จัดรูปแบบเพื่อแสดงผล |
| เวลา | ใช้ ISO 8601 UTC; วันที่ขายหมายถึงวันปฏิทินตามเขตเวลาของร้านจาก `STORE_TIMEZONE` ซึ่งมีค่าเริ่มต้นเป็น `Asia/Bangkok` |
| Response สำเร็จ | ส่ง field ของ endpoint ไว้ที่ระดับบนสุด ไม่มี wrapper กลางชื่อ `data`; `204` ไม่มี body |
| Response ผิดพลาด | `{ "error": { "code": "...", "message": "...", "details": [...] } }`; ส่ง `details` เฉพาะ error code ที่ระบุไว้ด้านล่าง |
| 400 กับ 422 | `400` = JSON เสียรูป, path ID ผิด หรือ query ผิด; `422` = JSON ถูกต้องแต่ข้อมูลใน body ไม่ผ่าน validation |
| Field ที่ไม่รู้จัก | ปฏิเสธด้วย `422` เพื่อไม่ให้ client ส่ง `id` หรือราคาที่ client กำหนดเอง |

### ข้อมูลที่เก็บใน cookie

Cookie ใช้เก็บ **เฉพาะ session token แบบสุ่มและคาดเดายาก** ไม่เก็บข้อมูลผู้ใช้โดยตรง

- ชื่อ cookie ที่แนะนำ: `sid`
- สร้าง session ID ด้วย `randomBytes(32).toString("base64url")` ให้ได้ random 32 bytes; ใช้ค่าที่ได้เป็น opaque token ใน cookie `sid`
- ก่อนบันทึกลง `sessions.token_hash` ให้ hash session ID ด้วย SHA-256 แล้วเข้ารหัสผลลัพธ์เป็น hexadecimal; ใช้วิธีเดียวกันเมื่อตรวจ session
- ค่า cookie เป็น opaque token ไม่ใช่ JSON หรือ JWT
- ห้ามใส่ username, password, password hash, user ID, role หรือข้อมูลโปรไฟล์ลงใน cookie
- ตั้งค่า `HttpOnly`, `SameSite=Lax`, `Path=/` และตั้ง `Secure` เมื่อใช้ HTTPS
- ไม่ส่ง token กลับมาใน JSON response และไม่เขียน token ลง log
- ฝั่ง server เก็บ hash ของ token พร้อม `userId`, `username`, เวลาสร้าง และเวลาหมดอายุไว้ในตาราง session; ตรวจ session จากข้อมูลฝั่ง server ทุกคำขอ
- เมื่อ logout ให้ลบหรือทำให้ session ฝั่ง server ใช้ไม่ได้ และส่ง `Set-Cookie` เพื่อล้าง `sid`
- อายุ session ยังไม่ได้กำหนดเป็นตัวเลข; ค่า `Expires`/`Max-Age` ของ cookie (ถ้ามี) ต้องสอดคล้องกับเวลาหมดอายุที่ server บันทึกไว้

ตัวอย่าง header เมื่อเข้าสู่ระบบสำเร็จ (ค่า token เป็นตัวอย่างเท่านั้น):

```http
Set-Cookie: sid=<opaque-random-token>; Path=/; HttpOnly; SameSite=Lax; Secure
```

ไม่ต้องใส่ `Secure` เมื่อรันผ่าน HTTP ในเครื่องเพื่อพัฒนา แต่ต้องเปิดใช้เมื่อ deploy ผ่าน HTTPS

### กฎการแก้ข้อมูลบัญชีเจ้าของ

- ทุกคำขอแก้บัญชีต้องส่ง `currentPassword` เพื่อยืนยันตัวตนอีกครั้ง
- ส่ง `newUsername`, `newPassword` หรือทั้งสอง field; ต้องส่งอย่างน้อยหนึ่ง field
- `newUsername` ต้องเป็น string ที่ตัดช่องว่างหัวท้ายแล้ว ยาว 1–100 ตัวอักษร
- `newPassword` ต้องเป็น string ยาว 12–128 ตัวอักษร; setup script ต้องบังคับความยาวขั้นต่ำเดียวกัน
- เมื่อแก้บัญชีสำเร็จ ให้ยกเลิก session เดิมทั้งหมด ล้าง cookie และให้เจ้าของเข้าสู่ระบบใหม่
- ถ้า `currentPassword` ไม่ถูกต้อง ให้ตอบ `401 INVALID_CREDENTIALS` และห้ามแก้ข้อมูลบัญชี

### ข้อจำกัดของสินค้า (ค่าที่เสนอ)

| Field | กฎ |
|---|---|
| `name` | string; ตัดช่องว่างหัวท้าย; ยาว 1–100 ตัวอักษร; ห้ามซ้ำโดยไม่สนตัวพิมพ์เล็ก/ใหญ่ |
| `amount` | จำนวนเต็มตั้งแต่ 0 ถึง 1,000,000 หน่วย |
| `priceSatang` | จำนวนเต็มตั้งแต่ 0 ถึง 100,000,000 สตางค์ |

### Error code

| Status | Code | เงื่อนไข | `details` |
|---|---|---|---|
| 400 | `BAD_REQUEST` | JSON เสียรูป, path ID ผิด หรือ query ผิด | ไม่มี |
| 401 | `UNAUTHENTICATED` | ไม่มี session, session หมดอายุ หรือ logout แล้ว | ไม่มี |
| 401 | `INVALID_CREDENTIALS` | username หรือ password ไม่ถูกต้อง | ไม่มี |
| 404 | `PRODUCT_NOT_FOUND` | ไม่มี product ID ดังกล่าว | ไม่มี |
| 409 | `PRODUCT_NAME_EXISTS` | มีสินค้าอื่นใช้ชื่อนี้แล้ว | ไม่มี |
| 409 | `INSUFFICIENT_STOCK` | จำนวนที่ขอขายมากกว่าสต็อก | `{ productId, name, requested, available }` ของทุกรายการที่สต็อกไม่พอ |
| 422 | `VALIDATION_ERROR` | body ไม่ผ่านกฎ validation | `{ field, message }` |
| 500 | `INTERNAL_ERROR` | เกิดข้อผิดพลาดที่ไม่คาดคิด; ห้ามเปิดเผย stack trace, SQL หรือ password hash | ไม่มี |

### ตัวอย่าง object

สินค้า:

```json
{
  "id": 1,
  "name": "Milk 1L",
  "amount": 24,
  "priceSatang": 2500,
  "createdAt": "2026-11-15T03:00:00.000Z",
  "updatedAt": "2026-11-15T03:00:00.000Z"
}
```

รายการขาย:

```json
{
  "id": 7,
  "items": [
    {
      "productId": 1,
      "name": "Milk 1L",
      "unitPriceSatang": 2500,
      "quantity": 2,
      "lineTotalSatang": 5000
    },
    {
      "productId": 2,
      "name": "Bread",
      "unitPriceSatang": 3000,
      "quantity": 1,
      "lineTotalSatang": 3000
    }
  ],
  "totalSatang": 8000,
  "createdAt": "2026-11-15T03:20:00.000Z"
}
```

รายการขายต้องเก็บ snapshot ของชื่อและราคาสินค้า เพื่อให้ประวัติไม่เปลี่ยนเมื่อแก้ไขหรือลบสินค้า `productId` ในรายการขายเป็นเพียงตัวเลขอ้างอิงในอดีต ไม่ใช่ foreign key ที่ผูกกับสินค้า ณ ปัจจุบัน

## 3. การตรวจสอบร่วมสำหรับทุก endpoint

ก่อนทดสอบ ให้เตรียมฐานข้อมูลและข้อมูลทดสอบขั้นต่ำที่ endpoint ต้องใช้ แล้วเข้าสู่ระบบเพื่อรับ session สำหรับ endpoint ที่ต้องยืนยันตัวตน ตัวอย่าง Response ใช้ `...` แทนข้อความหรือข้อมูลที่ขึ้นกับ runtime; `details` ใช้กับ `VALIDATION_ERROR` และ `INSUFFICIENT_STOCK` ตามกรณี

| ID | กรณีทดสอบ | ผลที่คาดหวัง | Response ที่คาดหวัง |
|---|---|---|---|
| G1 | เรียก endpoint ที่ต้องยืนยันตัวตนโดยไม่มี session, ใช้ cookie ปลอม หรือใช้ cookie เดิมหลัง logout (logout โดยไม่มี session ใช้กรณี LOGOUT-3) | `401 UNAUTHENTICATED`; logout โดยไม่มี session ตอบตาม LOGOUT-3 | `401 {"error":{"code":"UNAUTHENTICATED","message":"..."}}` |
| G2 | path ID เป็น `abc`, `0`, `-1` หรือ `1.5` | `400 BAD_REQUEST` | `400 {"error":{"code":"BAD_REQUEST","message":"..."}}` |
| G3 | body เป็น JSON เสียรูป | `400 BAD_REQUEST` | `400 {"error":{"code":"BAD_REQUEST","message":"..."}}` |
| G4 | ทุก error response | รูปแบบ error สอดคล้องกับ code และรายละเอียดของกรณีนั้น | `{"error":{"code":"...","message":"..."}}`; เพิ่ม `details` ตามเงื่อนไขของ error code |
| G5 | ทุก response สถานะ `2xx` | field ของ endpoint อยู่ระดับบนสุด; `204` จบ response ทันที | ตัวอย่าง: `200 {"user":{"id":1,"username":"owner"}}`; `204` |

### ตัวอย่างโค้ดฝั่ง Backend

ตัวอย่างต่อไปนี้ใช้ Express และ Drizzle ที่โครงการใช้อยู่ ปรับ import path ให้ตรงกับไฟล์ที่วาง middleware โดยติดตั้ง JSON parser ก่อน routes และติดตั้ง error handler หลัง routes

#### ตรวจ session cookie

สร้าง session ID จาก secure random bytes เมื่อ login สำเร็จ ส่งค่าดิบใน cookie และเก็บเฉพาะ hash ในฐานข้อมูล อ่าน `sid`, แปลง token เป็น hash แล้วค้นหา session ที่ยังไม่หมดอายุ จากนั้น middleware ส่ง `userId` และ `username` ให้ endpoint ถัดไปผ่าน `res.locals`

```ts
import { createHash, randomBytes } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "./db";
import { sessions } from "./db";

function createSessionId(): string {
  return randomBytes(32).toString("base64url");
}

function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

function sendApiError(
  res: Response,
  status: number,
  code: string,
  message: string,
) {
  return res.status(status).json({ error: { code, message } });
}

function readCookie(req: Request, name: string): string | undefined {
  const pair = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return pair?.slice(name.length + 1);
}

function requireSession(db: AppDatabase): RequestHandler {
  return (req, res, next) => {
    const token = readCookie(req, "sid");
    if (!token) {
      return sendApiError(res, 401, "UNAUTHENTICATED", "Authentication required");
    }

    const tokenHash = hashSessionId(token);
    const session = db
      .select({
        userId: sessions.userId,
        username: sessions.username,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .get();

    if (!session || session.expiresAt <= new Date().toISOString()) {
      return sendApiError(res, 401, "UNAUTHENTICATED", "Authentication required");
    }

    res.locals.userId = session.userId;
    res.locals.username = session.username;
    next();
  };
}
```

ใน `POST /api/auth/login` ให้สร้าง ID และ hash ก่อนบันทึก session:

```ts
const sessionId = createSessionId();
const tokenHash = hashSessionId(sessionId);

db.insert(sessions)
  .values({ tokenHash, userId, username: user.username, createdAt, expiresAt })
  .run();

res.append(
  "Set-Cookie",
  `sid=${sessionId}; Path=/; HttpOnly; SameSite=Lax${req.secure ? "; Secure" : ""}`,
);
```

ใช้ `requireSession(db)` กับทุก route ที่ต้องยืนยันตัวตน ส่วน `POST /api/auth/login` เป็น route สาธารณะ ส่ง session ID ผ่าน cookie และบันทึก hash ในฐานข้อมูล

#### จัดการ malformed JSON

ติดตั้ง `express.json()` ก่อน routes ให้ error handler ตรวจ error จาก JSON parser แล้วส่งรูปแบบ `BAD_REQUEST` ตามสัญญา โดย `apiRoutes` ในตัวอย่างคือ Express Router ที่รวม routes ของ API:

```ts
import type { ErrorRequestHandler } from "express";

function isMalformedJson(
  error: unknown,
): error is SyntaxError & { type: string } {
  return (
    error instanceof SyntaxError &&
    "type" in error &&
    error.type === "entity.parse.failed"
  );
}

const handleJsonParseError: ErrorRequestHandler = (
  error,
  _req,
  res,
  next,
) => {
  if (isMalformedJson(error)) {
    return sendApiError(res, 400, "BAD_REQUEST", "Malformed JSON");
  }

  next(error);
};

app.use(express.json());
app.use(apiRoutes);
app.use(handleJsonParseError);
```

## 4. รายละเอียด endpoint

### 4.1 การเข้าสู่ระบบ

#### `POST /api/auth/login`

เป็น endpoint สาธารณะ

Request:

```json
{ "username": "owner", "password": "..." }
```

สำเร็จ: `200` พร้อม body `{ "user": { "id": 1, "username": "owner" } }` และ `Set-Cookie` สำหรับ session ตามข้อกำหนด cookie ในหัวข้อ 2

**สิ่งที่ handler ต้องทำ**

- ตรวจ body ให้มี `username` และ `password` เป็น string และไม่มี field อื่น
- ค้นหาบัญชีและตรวจ password ด้วย bcrypt; ตอบ `401 INVALID_CREDENTIALS` ด้วยข้อความเดียวกันเมื่อไม่พบบัญชีหรือ password ไม่ถูกต้อง
- เมื่อยืนยันตัวตนสำเร็จ สร้าง session ID ตามวิธีในหัวข้อ 2 บันทึก hash พร้อม user และเวลาหมดอายุ แล้วส่ง session ID ผ่าน cookie `sid`
- ตอบ `200` ด้วย `user.id` และ `user.username`

| ID | สถานการณ์ | ผลที่คาดหวัง | Response ที่คาดหวัง |
|---|---|---|---|
| LOGIN-1 | username และ password ถูกต้อง | `200`; `user.username` เป็นบัญชีเจ้าของ; cookie มี `HttpOnly` และ `SameSite`; body ไม่มี password หรือ hash | `200 {"user":{"id":1,"username":"owner"}}` พร้อม `Set-Cookie: sid=<opaque-token>; Path=/; HttpOnly; SameSite=Lax` |
| LOGIN-2 | เรียก `GET /api/auth/me` ด้วย cookie จาก LOGIN-1 | `200` | `200 {"user":{"id":1,"username":"owner"}}` |
| LOGIN-3 | password ไม่ถูกต้อง | `401 INVALID_CREDENTIALS` | `401 {"error":{"code":"INVALID_CREDENTIALS","message":"..."}}` |
| LOGIN-4 | ไม่มี username ในระบบ | `401 INVALID_CREDENTIALS` และ code/message เหมือน LOGIN-3 | `401 {"error":{"code":"INVALID_CREDENTIALS","message":"..."}}` |
| LOGIN-5 | ขาด `username` หรือ `password` หรือชนิดไม่ใช่ string | `422 VALIDATION_ERROR` พร้อม `details[].field` | `422 {"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"field":"username","message":"..."}]}}`; field ที่ผิดต้องปรากฏใน `details` |

#### `POST /api/auth/logout`

ไม่รับ body เมื่อสำเร็จตอบ `204` และล้าง cookie

**สิ่งที่ handler ต้องทำ**

- อ่าน `sid` และค้นหา session ด้วย hash ของ token
- เมื่อ session มีอยู่ ให้ revoke session นั้น
- ส่ง header ล้าง cookie `sid` ทุกครั้ง และตอบ `204` เพื่อรองรับการเรียกซ้ำหรือกรณีไม่มี session

| ID | สถานการณ์ | ผลที่คาดหวัง | Response ที่คาดหวัง |
|---|---|---|---|
| LOGOUT-1 | logout ขณะมี session | `204`; cookie ถูกล้าง | `204` ไม่มี body; `Set-Cookie: sid=; ...; Max-Age=0` หรือ `Expires` ที่หมดอายุ |
| LOGOUT-2 | เรียก `GET /api/auth/me` ด้วย cookie เดิมหลัง logout | `401 UNAUTHENTICATED` | `401 {"error":{"code":"UNAUTHENTICATED","message":"..."}}` |
| LOGOUT-3 | logout โดยไม่มี session | `204` (เรียกซ้ำได้อย่างปลอดภัย) | `204` ไม่มี body |

#### `GET /api/auth/me`

สำเร็จ: `200` พร้อม body `{ "user": { "id": 1, "username": "owner" } }` Frontend ใช้ endpoint นี้ตัดสินใจว่าควรแสดงหน้าเข้าสู่ระบบหรือไม่ กรณีไม่มี session ครอบคลุมใน G1

**สิ่งที่ handler ต้องทำ**

- ใช้ session middleware เพื่อระบุผู้ใช้ปัจจุบัน
- อ่านบัญชีผู้ใช้จากฐานข้อมูลด้วย `userId` ใน session
- ตอบ `200` ด้วย `user.id` และ `user.username`

#### `PATCH /api/auth/me`

แก้ username หรือ password ของเจ้าของบัญชีที่เข้าสู่ระบบอยู่ ต้องส่ง `currentPassword` และ `newUsername`, `newPassword` อย่างน้อยหนึ่ง field ตัวอย่าง request:

```json
{
  "currentPassword": "รหัสผ่านเดิม",
  "newUsername": "owner-new",
  "newPassword": "รหัสผ่านใหม่ที่คาดเดายาก"
}
```

`newUsername` และ `newPassword` เป็น optional แต่ต้องส่งอย่างน้อยหนึ่งรายการ กฎความยาวอยู่ในหัวข้อ “กฎการแก้ข้อมูลบัญชีเจ้าของ” หากสำเร็จตอบ `200` พร้อม body `{ "user": { "id": 1, "username": "owner-new" } }` โดยไม่ส่ง password/hash กลับมา และล้าง session cookie เพื่อให้เข้าสู่ระบบใหม่

**สิ่งที่ handler ต้องทำ**

- ใช้ session middleware และตรวจ `currentPassword` กับ hash ปัจจุบันด้วย bcrypt
- ตรวจ body ตามกฎบัญชี: ต้องมี `currentPassword`, ต้องมี `newUsername` หรือ `newPassword` อย่างน้อยหนึ่ง field และรองรับเฉพาะ field ที่กำหนด
- ตัดช่องว่างหัวท้ายของ username; ตรวจความยาวและตรวจ username ซ้ำโดยไม่สนตัวพิมพ์เล็ก/ใหญ่
- hash password ใหม่ด้วย bcrypt เมื่อมี `newPassword`; เปลี่ยนเฉพาะค่าที่ส่งมา
- เมื่อบันทึกสำเร็จ revoke sessions ของผู้ใช้ทั้งหมด ล้าง cookie `sid` และตอบ `200` ด้วยข้อมูลผู้ใช้สาธารณะ

| ID | สถานการณ์ | ผลที่คาดหวัง | Response ที่คาดหวัง |
|---|---|---|---|
| ACCOUNT-1 | เปลี่ยนเฉพาะ username และยืนยัน current password ถูกต้อง | `200`; username ใหม่; ไม่มี password/hash ใน body; cookie ถูกล้าง | `200 {"user":{"id":1,"username":"owner-new"}}` พร้อม `Set-Cookie` ล้าง `sid` |
| ACCOUNT-2 | เปลี่ยนเฉพาะ password | `200`; cookie ถูกล้าง; เข้าสู่ระบบด้วย password ใหม่ได้และ password เดิมใช้ไม่ได้ | `200 {"user":{"id":1,"username":"owner"}}` พร้อม `Set-Cookie` ล้าง `sid` |
| ACCOUNT-3 | เปลี่ยนทั้ง username และ password | `200`; ต้องเข้าสู่ระบบใหม่ด้วยข้อมูลใหม่ | `200 {"user":{"id":1,"username":"owner-new"}}` พร้อม `Set-Cookie` ล้าง `sid` |
| ACCOUNT-4 | current password ไม่ถูกต้อง | `401 INVALID_CREDENTIALS`; username/password ไม่เปลี่ยน | `401 {"error":{"code":"INVALID_CREDENTIALS","message":"..."}}` |
| ACCOUNT-5 | ขาด `currentPassword` หรือไม่ส่งทั้ง `newUsername` และ `newPassword` | `422 VALIDATION_ERROR` พร้อม `details[].field` | `422 {"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"field":"currentPassword","message":"..."}]}}`; field ที่ขาดต้องปรากฏใน `details` |
| ACCOUNT-6 | `newUsername` หรือ `newPassword` ไม่ผ่านกฎความยาว/ชนิดข้อมูล | `422 VALIDATION_ERROR` พร้อม field ที่ผิด | `422 {"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"field":"newUsername","message":"..."}]}}` หรือ `field:"newPassword"` |
| ACCOUNT-7 | มี body field ที่ไม่รู้จัก | `422`; บัญชีไม่เปลี่ยน | `422 {"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"field":"<unknown>","message":"..."}]}}` |
| ACCOUNT-8 | แก้บัญชีสำเร็จแล้วใช้ session cookie เดิม | `401 UNAUTHENTICATED` | `401 {"error":{"code":"UNAUTHENTICATED","message":"..."}}` |

### 4.2 สินค้า

#### `POST /api/products`

ต้องส่งทั้งสาม field:

```json
{ "name": "Milk 1L", "amount": 24, "priceSatang": 2500 }
```

สำเร็จ: `201` พร้อม body `{ "product": Product }`

**สิ่งที่ handler ต้องทำ**

- ใช้ session middleware และตรวจว่ามี `name`, `amount`, `priceSatang` ตามชนิดและช่วงค่าที่กำหนด
- ตัดช่องว่างหัวท้ายของชื่อ และตรวจชื่อซ้ำโดยไม่สนตัวพิมพ์เล็ก/ใหญ่
- กำหนด `createdAt` และ `updatedAt` เป็น ISO 8601 UTC
- บันทึกสินค้าและตอบ `201` ด้วย object `product`

| ID | สถานการณ์ | ผลที่คาดหวัง | Response ที่คาดหวัง |
|---|---|---|---|
| PROD-C-1 | body ถูกต้อง | `201`; `id` เป็นจำนวนเต็มบวก; field ตรงกับที่ส่ง; `createdAt` และ `updatedAt` เป็น ISO UTC; ค้นพบสินค้าในรายการ | `201 {"product":{"id":1,"name":"Milk 1L","amount":24,"priceSatang":2500,"createdAt":"<ISO-UTC>","updatedAt":"<ISO-UTC>"}}` |
| PROD-C-2 | `name` เป็น `"  Milk 1L "` | บันทึกชื่อเป็น `"Milk 1L"` | `201 {"product":{"id":1,"name":"Milk 1L","amount":24,"priceSatang":2500,"createdAt":"<ISO-UTC>","updatedAt":"<ISO-UTC>"}}` |
| PROD-C-3 | ใช้ชื่อซ้ำ รวมถึงชื่อที่ต่างกันแค่ตัวพิมพ์เล็ก/ใหญ่ | `409 PRODUCT_NAME_EXISTS`; ไม่สร้างรายการใหม่ | `409 {"error":{"code":"PRODUCT_NAME_EXISTS","message":"..."}}` |
| PROD-C-4 | ขาด `name`, `amount` หรือ `priceSatang` | `422 VALIDATION_ERROR`; `details[].field` ระบุ field ที่ขาด | `422 {"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"field":"<missing-field>","message":"..."}]}}` |
| PROD-C-5 | `name` ว่าง, มีแต่ช่องว่าง, ยาว 101 ตัวอักษร หรือไม่ใช่ string | `422` | `422 {"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"field":"name","message":"..." }]}}` |
| PROD-C-6 | `amount` เป็น `-1`, `1.5`, `"5"` หรือ `1000001` | `422` | `422 {"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"field":"amount","message":"..."}]}}` |
| PROD-C-7 | `priceSatang` เป็น `-1`, `1.5`, `"25"` หรือ `100000001` | `422` | `422 {"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"field":"priceSatang","message":"..."}]}}` |
| PROD-C-8 | `amount: 0` และ `priceSatang: 0` | `201` (อนุญาตทั้งสองค่า) | `201 {"product":{"id":1,"name":"Milk 1L","amount":0,"priceSatang":0,"createdAt":"<ISO-UTC>","updatedAt":"<ISO-UTC>"}}` |
| PROD-C-9 | มี field เพิ่ม เช่น `"id": 99` | `422`; ไม่สร้างสินค้า | `422 {"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"field":"id","message":"..." }]}}` |

#### `PATCH /api/products/{id}`

ส่งเฉพาะ field ที่ต้องการแก้ (`name`, `amount`, `priceSatang`) โดย `amount` คือจำนวนสต็อกใหม่ ไม่ใช่จำนวนที่จะนำไปบวกเพิ่ม

สำเร็จ: `200` พร้อม body `{ "product": Product }`

**สิ่งที่ handler ต้องทำ**

- ใช้ session middleware; ตรวจ `id` เป็นจำนวนเต็มบวก และค้นหาสินค้าก่อนแก้ไข
- รับเฉพาะ `name`, `amount`, `priceSatang` และต้องมีอย่างน้อยหนึ่ง field
- ตรวจชนิดและช่วงค่าของ field ที่ส่งมา; trim ชื่อและตรวจชื่อซ้ำโดยยกเว้นสินค้ารายการปัจจุบัน
- อัปเดตเฉพาะ field ที่ส่งมาและกำหนด `updatedAt` เป็น ISO 8601 UTC
- ตอบ `200` ด้วยสินค้าใหม่หลังบันทึก

| ID | สถานการณ์ | ผลที่คาดหวัง | Response ที่คาดหวัง |
|---|---|---|---|
| PROD-U-1 | แก้เฉพาะ `name` | `200`; field อื่นไม่เปลี่ยน; `updatedAt` ไม่ก่อนเวลาเดิม | `200 {"product":Product}` โดยมีชื่อใหม่และ field อื่นตามเดิม |
| PROD-U-2 | ตั้ง `amount` เป็น 10 จากเดิม 24 | `amount` เป็น 10 พอดี | `200 {"product":Product}` โดย `amount:10` |
| PROD-U-3 | แก้เฉพาะ `priceSatang` | `200`; แสดงและบันทึกราคาใหม่ | `200 {"product":Product}` โดย `priceSatang` เป็นค่าใหม่ |
| PROD-U-4 | แก้ทั้งสาม field พร้อมกัน | `200`; ค่าทั้งสามเปลี่ยน | `200 {"product":Product}` โดยมี `name`, `amount`, `priceSatang` ใหม่ |
| PROD-U-5 | body ว่าง `{}` | `422` | `422 {"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"field":"<field>","message":"..."}]}}` |
| PROD-U-6 | เปลี่ยนชื่อให้ซ้ำกับสินค้าอื่น (ไม่สนตัวพิมพ์เล็ก/ใหญ่) | `409 PRODUCT_NAME_EXISTS`; สินค้าไม่เปลี่ยน | `409 {"error":{"code":"PRODUCT_NAME_EXISTS","message":"..."}}` |
| PROD-U-7 | เปลี่ยนชื่อเป็นชื่อเดิมแต่ใช้ตัวพิมพ์ต่างกัน เช่น `"MILK 1L"` | `200` (ไม่ถือว่าซ้ำกับตัวเอง) | `200 {"product":Product}` โดย `product.name` เป็น `"MILK 1L"` |
| PROD-U-8 | field ใหม่ไม่ถูกต้องตามกรณี PROD-C-5 ถึง PROD-C-7 | `422`; สินค้าไม่เปลี่ยน | `422 {"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"field":"<invalid-field>","message":"..."}]}}` |
| PROD-U-9 | มี field เพิ่ม เช่น `"id": 99` | `422` | `422 {"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"field":"id","message":"..."}]}}` |
| PROD-U-10 | ID ไม่มีในระบบ | `404 PRODUCT_NOT_FOUND` | `404 {"error":{"code":"PRODUCT_NOT_FOUND","message":"..."}}` |
| PROD-U-11 | แก้ราคาหลังจากขายสินค้าไปแล้ว | รายการขายเดิมยังแสดงราคาเดิม (ดู SALES-7) | `PATCH 200 {"product":Product}`; เมื่ออ่านยอดขาย `GET /api/sales` ตอบ `200` โดย `items[].items[]` ยังมีชื่อและราคา snapshot เดิม |

#### `GET /api/products`

Query: `search` (ไม่บังคับ), `limit` (ค่าเริ่มต้น 50; ช่วง 1–200), `offset` (ค่าเริ่มต้น 0; ต้องไม่น้อยกว่า 0)

สำเร็จ: `200` พร้อม body `{ "items": Product[], "total": 3, "limit": 50, "offset": 0 }`

กฎการค้นหา: ตัดช่องว่างหัวท้ายของ `search`; ถ้าค่าว่างให้แสดงรายการทั้งหมด; มิฉะนั้นค้นหาชื่อที่มีข้อความดังกล่าวโดยไม่สนตัวพิมพ์เล็ก/ใหญ่ หรือถ้าข้อความเป็นตัวเลขล้วน ให้ค้นหาสินค้าที่ ID ตรงกันด้วย เรียงตามชื่อโดยไม่สนตัวพิมพ์เล็ก/ใหญ่ แล้วเรียงตาม ID ค่า `total` คือจำนวนผลลัพธ์ทั้งหมดก่อนแบ่งหน้า

**สิ่งที่ handler ต้องทำ**

- ใช้ session middleware และตรวจ `limit` กับ `offset` ตามค่าเริ่มต้นและช่วงที่กำหนด
- trim ค่า `search`; ค้นหาชื่อแบบ case-insensitive และค้น ID แบบตรงกันเมื่อ search เป็นตัวเลขล้วน โดยตีความ `%` และ `_` เป็นอักขระค้นหาตามตัวอักษร
- คำนวณ `total` ก่อนแบ่งหน้า และเรียงตามชื่อแบบ case-insensitive แล้วตาม ID
- ตอบ `200` ด้วย `items`, `total`, `limit` และ `offset`

| ID | สถานการณ์ | ผลที่คาดหวัง | Response ที่คาดหวัง |
|---|---|---|---|
| PROD-L-1 | ไม่ส่ง query และมีสินค้า 3 รายการ | `200`; ได้ 3 รายการเรียงตามชื่อ พร้อม `total: 3`, `limit: 50`, `offset: 0` | `200 {"items":[Product,Product,Product],"total":3,"limit":50,"offset":0}` |
| PROD-L-2 | `search=milk` | พบชื่อที่มีคำว่า "milk" โดยไม่สนตัวพิมพ์เล็ก/ใหญ่ | `200 {"items":[Product,...],"total":<matches>,"limit":50,"offset":0}` |
| PROD-L-3 | `search=2` โดยมีสินค้า ID 2 และสินค้าอีกชื่อมีเลข 2 | พบทั้งสองรายการ รวมสินค้าที่ ID ตรงกัน | `200 {"items":[Product{id:2},Product{name:"...2..."}],"total":2,"limit":50,"offset":0}` |
| PROD-L-4 | ค้นหาแล้วไม่พบ | `200`; `items: []`; `total: 0` | `200 {"items":[],"total":0,"limit":50,"offset":0}` |
| PROD-L-5 | `search=` | ผลเหมือนการไม่ส่ง search | `200 {"items":[Product,...],"total":<all-matches>,"limit":50,"offset":0}` |
| PROD-L-6 | `search=%` และ `search=_` | ถือเป็นตัวอักษรค้นหาตามจริง ไม่ใช่ wildcard | `200 {"items":[Product,...],"total":<literal-matches>,"limit":50,"offset":0}` |
| PROD-L-7 | `limit=2&offset=2` เมื่อมีสินค้า 5 รายการ | ได้รายการที่ 3 และ 4; `total: 5` | `200 {"items":[Product3,Product4],"total":5,"limit":2,"offset":2}` |
| PROD-L-8 | `limit=0`, `limit=201`, `offset=-1` หรือ `limit=abc` | `400 BAD_REQUEST` | `400 {"error":{"code":"BAD_REQUEST","message":"..."}}` |

#### `DELETE /api/products/{id}`

ลบสินค้าออกถาวร เมื่อสำเร็จตอบ `204` โดยไม่มี body

**สิ่งที่ handler ต้องทำ**

- ใช้ session middleware; ตรวจ `id` เป็นจำนวนเต็มบวก และค้นหาสินค้าก่อนลบ
- ลบสินค้าและตอบ `204`
- คงรายการขายย้อนหลังไว้โดยอาศัย snapshot ใน `sale_items`

| ID | สถานการณ์ | ผลที่คาดหวัง | Response ที่คาดหวัง |
|---|---|---|---|
| PROD-D-1 | ลบสินค้าที่มีอยู่ | `204`; ไม่พบสินค้าในรายการอีก | `204` ไม่มี body |
| PROD-D-2 | ลบ ID เดิมซ้ำ | `404 PRODUCT_NOT_FOUND` | `404 {"error":{"code":"PRODUCT_NOT_FOUND","message":"..."}}` |
| PROD-D-3 | ลบ ID ที่ไม่เคยมี | `404 PRODUCT_NOT_FOUND` | `404 {"error":{"code":"PRODUCT_NOT_FOUND","message":"..."}}` |
| PROD-D-4 | ลบสินค้าที่มีรายการขายย้อนหลัง | `204`; ประวัติการขายยังแสดงชื่อและราคาเดิม | `DELETE 204` ไม่มี body; `GET /api/sales` ตอบ `200 {"date":"...","timezone":"...","summary":{"saleCount":1,"totalSatang":...},"items":[Sale-with-original-snapshot]}` |
| PROD-D-5 | ชำระเงินโดยมีสินค้าที่ถูกลบอยู่ในรายการ | `404 PRODUCT_NOT_FOUND` (ดู CO-7) | `404 {"error":{"code":"PRODUCT_NOT_FOUND","message":"..."}}` |

### 4.3 ชำระเงิน

#### `POST /api/checkout`

Request:

```json
{
  "items": [
    { "productId": 1, "quantity": 2 },
    { "productId": 2, "quantity": 1 }
  ]
}
```

สำเร็จ: `201` พร้อม body `{ "sale": Sale }`

Server ใช้เฉพาะ `productId` และ `quantity` จาก client แล้วอ่านราคาและสต็อกปัจจุบันจากฐานข้อมูล ภายใน transaction เดียวให้ตรวจสอบสินค้าทุกรายการ ลด `amount` และบันทึกการขาย หากขั้นตอนใดล้มเหลว ต้องไม่มีข้อมูลใดเปลี่ยนแปลง

**สิ่งที่ handler ต้องทำ**

- ใช้ session middleware และตรวจ body ให้มี `items` เป็น array ที่มีอย่างน้อยหนึ่งรายการ โดยแต่ละรายการมีเฉพาะ `productId` และ `quantity` เป็นจำนวนเต็มบวก และไม่มี `productId` ซ้ำ
- ใช้ transaction เดียวอ่านสินค้าและราคา/สต็อกปัจจุบัน ตรวจสินค้าทุก ID และรวบรวมรายการที่สต็อกไม่พอ; หากมีรายการที่สต็อกไม่พอ ให้ rollback และตอบ `409 INSUFFICIENT_STOCK` พร้อม `details` ของทุกรายการ
- เมื่อทุกสินค้าพร้อมขาย คำนวณยอดจากราคาฐานข้อมูล ลดสต็อก และบันทึก `sales` กับ `sale_items` พร้อม snapshot ชื่อและราคา
- ให้ transaction รองรับคำขอ checkout ที่ทำงานพร้อมกันโดยไม่ทำให้สต็อกติดลบ; commit เมื่อทุกขั้นตอนสำเร็จ และ rollback เมื่อมีข้อผิดพลาดก่อนส่ง error ตามกรณีในตาราง
- ตอบ `201` ด้วย `sale` ที่มีรายการ snapshot และยอดรวม

ข้อมูลทดสอบ: สินค้า ID 1 ชื่อ "Milk 1L" ราคา 2500 สตางค์ สต็อก 24; สินค้า ID 2 ชื่อ "Bread" ราคา 3000 สตางค์ สต็อก 5

| ID | สถานการณ์ | ผลที่คาดหวัง | Response ที่คาดหวัง |
|---|---|---|---|
| CO-1 | ส่ง request ตัวอย่างข้างต้น | `201`; `totalSatang: 8000`; line total เท่ากับ 5000 และ 3000; ชื่อและราคาต่อหน่วยเป็น snapshot; สต็อกเหลือ 22 และ 4; พบรายการขายใน `GET /api/sales` ของวันนี้ | `201 {"sale":{"id":7,"items":[{"productId":1,"name":"Milk 1L","unitPriceSatang":2500,"quantity":2,"lineTotalSatang":5000},{"productId":2,"name":"Bread","unitPriceSatang":3000,"quantity":1,"lineTotalSatang":3000}],"totalSatang":8000,"createdAt":"<ISO-UTC>"}}` |
| CO-2 | ส่ง `unitPriceSatang` ในรายการ หรือ `totalSatang` ใน body | `422`; ข้อมูลไม่เปลี่ยน (ห้ามเชื่อราคาจาก client) | `422 {"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"field":"unitPriceSatang","message":"..."}]}}` หรือ `field:"totalSatang"` |
| CO-3 | ซื้อสต็อกทั้งหมดพอดี (Bread จำนวน 5) | `201`; สต็อก Bread เป็น 0 | `201 {"sale":{"id":7,"items":[{"productId":2,"name":"Bread","unitPriceSatang":3000,"quantity":5,"lineTotalSatang":15000}],"totalSatang":15000,"createdAt":"<ISO-UTC>"}}` |
| CO-4 | ซื้อ Milk จำนวน 25 ทั้งที่มี 24 | `409 INSUFFICIENT_STOCK`; `details` มี `{ productId: 1, name: "Milk 1L", requested: 25, available: 24 }`; สต็อกและรายการขายไม่เปลี่ยน | `409 {"error":{"code":"INSUFFICIENT_STOCK","message":"...","details":[{"productId":1,"name":"Milk 1L","requested":25,"available":24}]}}` |
| CO-5 | Milk จำนวน 2 (เพียงพอ) และ Bread จำนวน 6 (ไม่พอ) | `409`; **สต็อก Milk ยังเป็น 24** และไม่มีรายการขาย (ยกเลิกทั้งหมด) | `409 {"error":{"code":"INSUFFICIENT_STOCK","message":"...","details":[{"productId":2,"name":"Bread","requested":6,"available":5}]}}` |
| CO-6 | สินค้าทั้งสองรายการมีสต็อกไม่พอ | `409`; `details` ระบุสินค้าทั้งสองรายการ | `409 {"error":{"code":"INSUFFICIENT_STOCK","message":"...","details":[{"productId":1,"name":"Milk 1L","requested":2,"available":1},{"productId":2,"name":"Bread","requested":3,"available":1}]}}` |
| CO-7 | `productId` ไม่มีอยู่หรือสินค้าถูกลบแล้ว | `404 PRODUCT_NOT_FOUND`; ไม่มีข้อมูลเปลี่ยน | `404 {"error":{"code":"PRODUCT_NOT_FOUND","message":"..."}}` |
| CO-8 | `items: []` หรือไม่ส่ง `items` | `422` | `422 {"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"field":"items","message":"..."}]}}` |
| CO-9 | `quantity` เป็น `0`, `-1`, `1.5`, `"2"` หรือ `productId` ไม่ใช่จำนวนเต็ม | `422` | `422 {"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"field":"items[0].quantity","message":"..."}]}}` หรือ `field:"items[0].productId"` |
| CO-10 | มี `productId` ซ้ำในคำขอเดียวกัน | `422` (Frontend ต้องรวมบรรทัดสินค้าให้เหลือรายการเดียว) | `422 {"error":{"code":"VALIDATION_ERROR","message":"...","details":[{"field":"items","message":"..."}]}}` |
| CO-11 | ราคาเปลี่ยนหลังจากเพิ่มสินค้าลงตะกร้า | ใช้ราคาปัจจุบันจากฐานข้อมูล | `201 {"sale":{"id":7,"items":[{"productId":1,"name":"Milk 1L","unitPriceSatang":<current-price>,"quantity":2,"lineTotalSatang":<current-line-total>}],"totalSatang":<current-total>,"createdAt":"<ISO-UTC>"}}` |
| CO-12 | ส่งคำขอพร้อมกันสองรายการเพื่อซื้อสินค้าชิ้นสุดท้าย | สำเร็จหนึ่งคำขอและได้ `409` หนึ่งคำขอ; สต็อกเป็น 0 ไม่ติดลบ; มีรายการขายเพียงหนึ่งรายการ | คำขอที่สำเร็จ: `201 {"sale":Sale}`; อีกคำขอ: `409 {"error":{"code":"INSUFFICIENT_STOCK","message":"...","details":[{"productId":1,"name":"...","requested":1,"available":0}]}}` |
| CO-13 | จำลองข้อผิดพลาดฐานข้อมูลระหว่างบันทึกรายการขาย | `500 INTERNAL_ERROR`; สต็อกไม่เปลี่ยนและไม่มีรายการขาย | `500 {"error":{"code":"INTERNAL_ERROR","message":"..."}}` |

### 4.4 ดูยอดขายรายวัน

#### `GET /api/sales`

Query: `date` รูปแบบ `YYYY-MM-DD` (ไม่บังคับ; ค่าเริ่มต้นคือวันนี้ตามเขตเวลาของร้าน)

สำเร็จ: `200` พร้อม body:

```json
{
  "date": "2026-11-15",
  "timezone": "Asia/Bangkok",
  "summary": { "saleCount": 2, "totalSatang": 11000 },
  "items": [ Sale, Sale ]
}
```

เรียงรายการขายจากใหม่ไปเก่า ไม่แบ่งหน้า เพราะแสดงยอดขายทั้งหมดของวันนั้น

**สิ่งที่ handler ต้องทำ**

- ใช้ session middleware; ตรวจรูปแบบและความถูกต้องจริงของ `date` เมื่อส่งมา
- ใช้ `STORE_TIMEZONE` (ค่าเริ่มต้น `Asia/Bangkok`) เพื่อแปลงวันที่เป็นช่วงเวลา UTC แบบเริ่มต้นรวมและสิ้นสุดไม่รวม; เมื่อไม่ส่ง `date` ให้ใช้วันนี้ในเขตเวลาร้าน
- อ่านยอดขายในช่วงวันนั้น เรียงจากใหม่ไปเก่า และดึง `sale_items` จาก snapshot ที่บันทึกไว้
- คำนวณ `saleCount` และ `totalSatang` จากรายการขาย แล้วตอบ `200` พร้อม `date`, `timezone`, `summary` และ `items`

| ID | สถานการณ์ | ผลที่คาดหวัง | Response ที่คาดหวัง |
|---|---|---|---|
| SALES-1 | วันที่มีรายการขาย 2 รายการ | `items` มี 2 รายการเรียงใหม่ไปเก่า; `summary.saleCount` เป็น 2; `summary.totalSatang` เท่ากับผลรวมยอดขาย | `200 {"date":"2026-11-15","timezone":"Asia/Bangkok","summary":{"saleCount":2,"totalSatang":11000},"items":[Sale-newest,Sale-older]}` |
| SALES-2 | วันที่ไม่มีรายการขาย | `200`; `items: []`; `saleCount: 0`; `totalSatang: 0` | `200 {"date":"2026-11-15","timezone":"Asia/Bangkok","summary":{"saleCount":0,"totalSatang":0},"items":[]}` |
| SALES-3 | ไม่ส่ง `date` | ใช้วันนี้ตามเขตเวลาร้าน และ `date` ใน response เป็นวันนี้ | `200 {"date":"<today-in-store-timezone>","timezone":"Asia/Bangkok","summary":{"saleCount":<count>,"totalSatang":<sum>},"items":[...]}` |
| SALES-4 | ขอบเขตวันใน `Asia/Bangkok`: รายการขายเวลา `2026-11-15T16:59:59Z` และ `2026-11-15T17:00:00Z` | รายการแรกอยู่ใน `date=2026-11-15`; รายการที่สองอยู่ใน `date=2026-11-16` | วันที่ 15: `200 {"date":"2026-11-15","timezone":"Asia/Bangkok","summary":{"saleCount":1,"totalSatang":...},"items":[Sale-before-midnight]}`; วันที่ 16 มีรูปแบบเดียวกันและมี `Sale-at-midnight` |
| SALES-5 | `date` เป็น `2026-13-01`, `2026-02-30`, `15-11-2026` หรือ `abc` | `400 BAD_REQUEST` | `400 {"error":{"code":"BAD_REQUEST","message":"..."}}` |
| SALES-6 | ตรวจทุกรายการขาย | `lineTotalSatang = unitPriceSatang × quantity`; `totalSatang` เท่ากับผลรวม line total | `200 {"date":"...","timezone":"...","summary":{"saleCount":1,"totalSatang":<sum>},"items":[{"id":7,"items":[{"productId":1,"name":"Milk 1L","unitPriceSatang":2500,"quantity":2,"lineTotalSatang":5000},...],"totalSatang":<sum>,"createdAt":"<ISO-UTC>"}]}` |
| SALES-7 | แก้ราคาสินค้าที่ขายแล้ว จากนั้นลบสินค้า | รายการขายยังแสดงชื่อเดิม ราคาต่อหน่วยเดิม และยอดเดิม | `200 {"date":"...","timezone":"...","summary":{"saleCount":1,"totalSatang":<original-total>},"items":[{"id":7,"items":[{"productId":1,"name":"Milk 1L","unitPriceSatang":2500,"quantity":2,"lineTotalSatang":5000}],"totalSatang":5000,"createdAt":"<ISO-UTC>"}]}` |

## 5. การเตรียมข้อมูลทดสอบ

- `server/src/test/test-app.ts` สร้างฐานข้อมูล SQLite ในหน่วยความจำพร้อม schema และบัญชีเจ้าของสำหรับทดสอบ
- รีเซ็ตข้อมูลระหว่าง test case และเข้าสู่ระบบผ่าน API ด้วย Supertest agent เพื่อทดสอบ session cookie จริง
- บัญชีทดสอบเก็บ password hash แบบ bcrypt; API ต้องตรวจสอบรหัสผ่านด้วย bcrypt และห้ามส่ง hash กลับใน response
- จากโฟลเดอร์ `server` ใช้คำสั่งต่อไปนี้เพื่อรันทุกชุดหรือเลือกชุดตาม path:

```sh
npm test
npm run test:auth
npm run test:products
npm run test:checkout
npm run test:sales
npm run test:health
npm run test:schema
```

คำสั่งสำหรับรัน test แยกตาม endpoint:

| Endpoint | คำสั่ง |
|---|---|
| `POST /api/auth/login` | `npm run test:auth:login` |
| `POST /api/auth/logout` | `npm run test:auth:logout` |
| `GET /api/auth/me` | `npm run test:auth:me:get` |
| `PATCH /api/auth/me` | `npm run test:auth:me:patch` |
| `POST /api/products` | `npm run test:products:create` |
| `PATCH /api/products/{id}` | `npm run test:products:update` |
| `GET /api/products` | `npm run test:products:list` |
| `DELETE /api/products/{id}` | `npm run test:products:delete` |
| `POST /api/checkout` | `npm run test:checkout:create` |
| `GET /api/sales` | `npm run test:sales:list` |

แต่ละคำสั่ง build backend ก่อน แล้วรันเฉพาะ test case ของ endpoint ที่ระบุ

## 6. ข้อตกลงของ MVP

- ลบสินค้าออกถาวร แต่เก็บสำเนาชื่อและราคาในรายการขายเพื่อรักษาประวัติ
- ชื่อสินค้าตัดช่องว่างหัวท้ายและไม่ซ้ำโดยไม่สนตัวพิมพ์เล็ก/ใหญ่
- ปฏิเสธ body field ที่ไม่รู้จัก ไม่ละเลย field เหล่านั้น
- เงินเป็นจำนวนเต็มหน่วยสตางค์ และคำว่า "วันนี้" หรือ "วัน" อิงเขตเวลาร้าน (ค่าเริ่มต้น `Asia/Bangkok`)
- ขีดจำกัดชื่อสินค้า จำนวนสต็อก ราคา และ `limit` ในหัวข้อ 2 เป็นค่าที่เสนอไว้
- ไม่มี idempotency key ใน checkout; Frontend ต้องปิดปุ่มระหว่างคำขอกำลังทำงาน แต่การปิดปุ่มอย่างเดียวไม่รับประกันการป้องกันคำขอซ้ำจากเครือข่าย
