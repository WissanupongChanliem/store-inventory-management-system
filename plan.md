# Simple Store App — Backend Implementation Plan

## Goal

Implement the small single-store backend defined in [Simple app API spec](./Simple%20app%20API%20spec.md). One owner can log in, maintain products and stock, record checkout sales without tender tracking, and view sales for a store-local calendar day.

The API spec is the source of truth for request/response shapes, validation limits, status codes, and test cases. This plan intentionally excludes every feature not listed in that spec.

## MVP use cases

| ID | Owner can… | API |
|---|---|---|
| REQ-001 | Log in, log out, and check the current session. | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| REQ-002 | Create products with a name, on-hand amount, and price in satang. | `POST /api/products` |
| REQ-003 | Update a product's name, absolute on-hand amount, or price. | `PATCH /api/products/:id` |
| REQ-004 | List products and search by case-insensitive name or product ID. | `GET /api/products` |
| REQ-005 | Permanently delete a product without losing its historical sale snapshots. | `DELETE /api/products/:id` |
| REQ-006 | Check out product quantities; the server validates current stock and prices, atomically deducts stock, and saves a sale. | `POST /api/checkout` |
| REQ-007 | View a day's sales, totals, and sale count in the configured store timezone. | `GET /api/sales?date=YYYY-MM-DD` |
| REQ-008 | Change the owner's username and/or password after confirming the current password. | `PATCH /api/auth/me` |

The checkout basket lives in browser state. The client sends only product IDs and positive integer quantities; it disables checkout while a request is in flight.

The proposed website pages and shared UI states are listed separately in [website-pages.md](./website-pages.md).

## API contract summary

- All routes except `POST /api/auth/login` require the single owner's session cookie.
- The owner account is created by a setup script from `OWNER_USERNAME` and `OWNER_PASSWORD`; persist only a password hash. The owner can change their own credentials through `PATCH /api/auth/me`; there is no signup or staff-management API.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` over HTTPS. This MVP does not use CSRF tokens. Add login rate limiting before exposing the service beyond a trusted local network.
- Successful JSON responses expose endpoint fields at the top level with no common `data` wrapper. Logout and successful product deletion return `204` with no body.
- Errors use `{ "error": { "code": "...", "message": "...", "details": [...] } }`. Do not expose stack traces, SQL, or password hashes. `details` is used for validation and insufficient-stock errors as defined by the spec.
- Malformed JSON, invalid path IDs, and invalid queries return `400 BAD_REQUEST`; valid JSON with invalid fields returns `422 VALIDATION_ERROR`.
- Product names are trimmed and unique without regard to case. `amount` is an integer from 0 to 1,000,000; `priceSatang` is an integer from 0 to 100,000,000. Reject unknown body fields.
- Product listing supports case-insensitive name search, numeric ID search, and `limit`/`offset` pagination as defined in the API spec.
- Checkout reads product names, prices, and stock from SQLite; client-supplied prices or totals are rejected. A successful checkout stores product name and price snapshots, and updates stock and sale records in one transaction. Any failure leaves both unchanged.
- Sales retain their snapshots after a product is renamed, repriced, or permanently deleted.
- Sales are listed newest first by calendar date in `STORE_TIMEZONE` (default `Asia/Bangkok`). Persist timestamps as ISO-compatible UTC values and calculate date boundaries in the configured store timezone.
- Money is stored and returned as integer satang. Tax, cash tender, change, and discounts are not part of this MVP.

See the API spec for endpoint examples and its concrete test cases, including all validation bounds and date-boundary scenarios.

## Data model

Keep persistence to the minimum needed for the contract:

- `users`: the single owner account, username, password hash, and fields needed for session authentication.
- `sessions`: server-side session identifier and owner reference; store only a hash of the session identifier if supported by the selected session implementation.
- `products`: ID, case-insensitive unique name, on-hand `amount`, `priceSatang`, `createdAt`, and `updatedAt`.
- `sales`: ID, `totalSatang`, and creation timestamp.
- `sale_items`: sale ID, product ID as a historical numeric value (not a cascading foreign key), product-name snapshot, unit-price snapshot, quantity, and line total.

Do not add supplier, purchase-order, inventory-movement, customer, loyalty, register, discount, tax, audit, or report tables for this MVP.

## Technical approach

- Backend: TypeScript, Express, SQLite with `better-sqlite3` and Drizzle ORM.
- Use typed Drizzle schema definitions and migrations for the five MVP tables.
- Keep HTTP routes thin; put validation and checkout transaction logic in small services.
- Use one shared error handler and explicit request validation. Avoid role frameworks and generic abstractions that are not needed by these routes.
- Tests: Jest and Supertest, with a fresh SQLite database per test run and the owner fixture loaded from test-only environment values.
- Keep the client basket in browser state. No global or server-side cart table.

## Delivery plan

### Phase 1 — Authentication and products

1. Define the SQLite/Drizzle schema and clean database initialization for the owner, sessions, and products.
2. Add the owner setup script and session login/logout/current-user/credential-update routes.
3. Implement product create, update, list/search, and permanent delete with the contract's validation and error codes.
4. Add focused tests for session behavior, product CRUD, name normalization/collisions, query parsing, and error envelopes.

### Phase 2 — Checkout and daily sales

1. Define sales and sale-item snapshot tables.
2. Implement checkout as a single transaction: validate the complete request, re-read each product, check all stock, calculate totals, persist snapshots, and decrement stock.
3. Implement daily sales listing, summary totals, newest-first ordering, and store-timezone boundaries.
4. Add focused tests for insufficient stock, all-or-nothing rollback, concurrent checkout for the final unit, snapshots after product edits/deletion, and date boundaries.
5. Run the TypeScript build and full backend test suite; document environment setup and run commands.

## Acceptance criteria

- The seven API use cases in the MVP table work with the response and error contracts in the API spec.
- Unauthenticated requests are rejected except for login; logout is safe to repeat and invalidates the old session.
- The owner can change their username and/or password only after providing the current password; credential changes invalidate existing sessions and require a new login.
- Product validation rejects missing, malformed, out-of-range, and unknown fields. Product name uniqueness is case-insensitive and ignores surrounding whitespace.
- Product deletion removes it from the catalog but does not break past sales.
- Checkout trusts only product IDs and quantities, uses current database prices, and is atomic across all requested lines. Insufficient stock or a database failure creates no sale and changes no stock.
- Two concurrent checkouts for the last unit produce one success and one insufficient-stock response; stock never becomes negative.
- Daily sales totals reconcile with sale line snapshots and honor the configured timezone.
- TypeScript compilation and all implemented backend tests pass.

## Explicitly out of scope

Multiple stores or staff, roles, CSRF, login rate limiting while strictly local-only (rate limiting is required before network exposure), suppliers and purchasing, stock movement history, low-stock alerts, product archive/restore, customers and loyalty, discounts, tax, cash tender/change, register sessions, refunds/voids, idempotency keys, general reports/exports, barcode scanning, pagination cursors, general settings, and frontend implementation.

This is a focused backend MVP, not the complete store-management roadmap. Any excluded feature requires a separate scope decision before being added.
