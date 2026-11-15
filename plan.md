# Store Management Web App — Implementation Plan

## Goal

Rebuild the existing store-management application as a Thai-language JavaScript web app with a Svelte frontend, Express API, SQLite persistence through Drizzle ORM, and Jest tests. Preserve current workflows and add purchasing, inventory-control, sales, customer loyalty, reporting, and operational features for a complete single-store system.

## What the Existing App Does

- Requires a username and password before showing the app.
- Provides a home/help page, product inventory view, product maintenance page, cash register, and static management-team page.
- Lists inventory fields: product ID, name, unit price, on-hand quantity, and stamps earned per unit.
- Adds, edits, deletes, and searches products by name or ID. Product names are unique.
- Builds a checkout basket from product ID and quantity, allows basket item removal, calculates totals and stamps, accepts cash payment, shows change, and reduces stock.
- Uses Thai baht and Thai-language content in parts of the UI.

The current checkout basket is stored in a shared temporary database table; checkout is not transactional, does not reject insufficient payment, and has no persisted sale history. The `customer` table mentioned in `src/db.txt` is not implemented in the UI or workflows.

## Scope and Priorities

### Requirements and priorities

| ID | Requirement | Priority |
|---|---|---|
| REQ-001 | Staff can sign in and out; protected pages and API operations require an authenticated session. | P1 |
| REQ-002 | Staff can view inventory and search products by name or exact product ID. | P1 |
| REQ-003 | Staff can create, edit, archive, and restore products with validated name, final customer-facing price, quantity, and stamps-per-unit fields. Product names remain unique; the app does not calculate tax. | P1 |
| REQ-004 | Staff can create a checkout basket by product ID and quantity, change/remove basket items, and see line totals, grand total, and stamps earned. | P1 |
| REQ-005 | Staff can complete checkout using cash only when the basket is non-empty and stock is sufficient; require payment to cover the total and show change due. | P1 |
| REQ-006 | Successful checkout atomically records the sale and payment, writes stock movements, and decrements inventory; failed checkout changes nothing. | P1 |
| REQ-007 | The app provides a home/help page and a management-team information page comparable to the existing static content. | P2 |
| REQ-008 | Staff can manage suppliers and purchase orders, receive full or partial deliveries, and update inventory from received quantities. | P1 |
| REQ-009 | Staff can make reasoned stock adjustments, review a complete movement history, and identify products below their reorder threshold. | P1 |
| REQ-010 | Staff can search and inspect sales/receipts and open and close a cash register session with expected-versus-counted cash reconciliation. | P1 |
| REQ-011 | Managers can create/deactivate staff accounts and assign cashier, manager, or both permissions so one person can run a self-managed store. The app audits sensitive actions, including price changes, receiving, adjustments, and account changes. | P1 |
| REQ-012 | Staff can create customer profiles and associate them with sales. Stamps can be earned and redeemed using a manager-set baht-per-stamp rate; balances do not reset or expire, and all changes are recorded in an auditable ledger. | P2 |
| REQ-013 | Products support optional SKU/barcode and category; barcode scanners can enter products at checkout. | P2 |
| REQ-014 | Managers can view date-range sales, product, inventory valuation, stock movement, and low-stock reports and export report data. | P2 |
| REQ-015 | Managers can configure discounts up to 100%. The app does not calculate or record tax; managers enter final customer-facing product prices. Cash is the only accepted payment method. | P2 |

### Explicitly out of MVP

- Multi-store inventory, external accounting integrations, and payment-gateway/card processing.
- Returns, refunds, and voids; completed sales remain immutable.
- In-app or automated database backup and restore.
- Stamp resets or expiration; customer stamp balances persist until redeemed.
- Tax calculation or tax reporting; managers set product prices themselves.
- Legacy MySQL data import; the new app starts with a clean SQLite database.

## Proposed Technical Design

### Application structure

- `client/`: Svelte single-page app, built with Vite; JavaScript (not TypeScript).
- `server/`: Express REST API, authentication/session middleware, validation, business services, and Drizzle schema.
- `server/db/`: SQLite connection, Drizzle schema, migrations, and non-production seed data.
- `client/src/lib/`: shared API client and reusable UI components.
- `client/src/routes/` or equivalent Svelte page structure: login, home/help, inventory/catalog, suppliers/purchasing, checkout/register, sales, customers, reports, settings, management team.
- `server/src/`: app setup, routes, middleware, services, and database access. Keep HTTP handling separate from checkout and inventory business rules.

Use SQLite with Drizzle ORM and a Node SQLite driver. Store database path and session secrets in environment configuration; never put credentials or production secrets in source control. Use Jest for backend unit/API tests and Svelte component tests, with Supertest for Express requests and a Jest-compatible Svelte transformer configured during project setup.

### Data model

- `users`: ID, unique username, password hash, active status, and timestamps. Store cashier and manager permissions as separate user-role assignments so one account may have either or both roles. A development-only seed script creates sample products and a sample staff account using a locally supplied password; it must refuse production environments. Do not reuse plaintext credentials from the legacy SQL dump. Record sensitive actions in `audit_events` with actor, action, entity, reason, and timestamp.
- `products`: auto-increment ID, unique name, final customer-facing unit price in integer satang, nonnegative on-hand quantity, nonnegative stamps-per-unit, optional unique SKU/barcode, optional category, reorder threshold, and active/archived status. Archived products remain available to historical records but are excluded from active inventory and new baskets; management can view and restore them.
- `suppliers`, `purchase_orders`, and `purchase_order_items`: supplier contact data, order status, ordered/received quantities, unit cost in integer satang, and timestamps. Receiving is recorded as stock movement; support partial receipts.
- `inventory_movements`: product, signed quantity change, movement type, reason, optional purchase/sale/adjustment reference, actor, and timestamp. Treat this as the traceable record for all stock changes.
- `sales` and `sale_items`: receipt totals in integer satang and immutable product, final price, quantity, discount, and stamps snapshots; sales also snapshot redeemed stamp count, satang-per-stamp rate, and the resulting discount. Do not store tax fields.
- `payments`: sale, cash tender amount, and cash change in integer satang; cash is the only accepted tender.
- `register_sessions`: opening float, expected cash, counted cash, and variance in integer satang; opened/closed by and open/close timestamps.
- `customers` and `loyalty_transactions`: optional customer identity and an append-only ledger of stamps earned or redeemed; derive or reconcile persistent balances from ledger entries.
- `settings`: manager-controlled discount rules (maximum 100%) and baht-per-stamp conversion rate, both with effective dates and audit events. The app has no tax settings because managers enter final product prices.
- Report queries: derive date-range sales, inventory valuation, and stock movement reports from sales, payment, product, and movement records rather than maintaining duplicate totals.

Persist completed sales, payments, stock movements, and loyalty changes as auditable business records. Do not create a shared, global basket table: keep each in-progress basket scoped to its authenticated session (or client state) and revalidate it against current product data on checkout. For a single-store deployment, SQLite is the initial database; revisit the database choice before multi-store or high-concurrency deployment.

Represent all monetary values as integer satang in storage and API contracts; format baht amounts in the Thai UI. The manager-entered product price is the final customer-facing price, and the application does not calculate tax.

### API outline

- `GET /api/health`
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET|POST /api/users`, `PATCH /api/users/:id` — manager-only staff account and role administration.
- `GET /api/products?search=...&status=...`, `POST /api/products`
- `PATCH /api/products/:id`, `POST /api/products/:id/archive`, `POST /api/products/:id/restore`
- `GET|POST /api/suppliers`, `PATCH /api/suppliers/:id`
- `GET|POST /api/purchase-orders`, `PATCH /api/purchase-orders/:id`, `POST /api/purchase-orders/:id/receipts`
- `GET /api/inventory/movements`, `POST /api/inventory/adjustments`, `GET /api/inventory/low-stock`
- `GET /api/cart`, `PUT /api/cart/items/:productId`, `DELETE /api/cart/items/:productId`
- `POST /api/register-sessions`, `POST /api/register-sessions/:id/close`
- `POST /api/checkout` — accepts optional customer ID and cash received; returns the finalized receipt or a validation error.
- `GET /api/sales`, `GET /api/sales/:id`
- `GET|POST /api/customers`, `PATCH /api/customers/:id`, `GET /api/customers/:id/loyalty`
- `GET /api/reports/:reportType`, `GET|PATCH /api/settings`
- Full endpoint response and error contracts are documented in [api-service-contracts.md](./.github/modernize/assessment/engines/facts/api-service-contracts.md).

Use consistent JSON error responses and appropriate HTTP status codes. Validate request bodies on the server, use Drizzle parameterized operations, and return no password hashes. For authentication, use secure password hashing and server-side sessions in an HTTP-only cookie; configure same-site cookie protections and CSRF protection for state-changing requests. In production, require HTTPS and secure cookies.

### Checkout rules

1. Re-read all basket products and stock from SQLite when checkout starts; do not trust prices or totals supplied by the browser.
2. Reject an empty basket, invalid/non-positive quantities, missing products, insufficient stock, and payment below the computed total.
3. In a single SQLite transaction, write the sale and sale-line snapshots and decrement every affected product's stock. On any failure, roll back all writes and leave the basket intact.
4. Return a receipt containing product lines, total, cash received, change, and stamps earned. Clear the basket only after successful commit.
5. Add an idempotency mechanism (for example, a checkout request key) so a retried request cannot create a duplicate sale or deduct stock twice.
6. Require an open register session for each cash sale and compute expected cash from recorded cash tenders.
7. Treat the manager-entered product price as the final customer-facing price. Do not calculate, add, or record tax. Apply manager-configured discounts (up to 100%) and stamp redemption to the subtotal; record the effective discount and stamp conversion settings on each sale.
8. Do not provide returns, refunds, or voids. Completed sales are immutable.
9. A manager-configured baht-per-stamp rate determines the value of redeemed stamps. Stamp redemption cannot reduce the subtotal after other discounts below zero; record the rate and redemption on the sale and ledger.

## Delivery Plan and Executable Tasks

Tasks are ordered by dependency. The P1 operational workflows are required for the first complete single-store release; P2 features extend that release after the base workflows are stable.

### Phase 1 — Scaffold and quality baseline

- [ ] T001 Create the `client/` Svelte/Vite and `server/` Express JavaScript workspace, npm scripts, environment example, clean SQLite initialization, development-only sample seed script, and Jest configurations. **Done when:** the client and API start against a new database, the seed script refuses production mode, and a sample Jest test runs.
- [ ] T002 Configure Thai-language UI conventions, shared styling/layout, and responsive navigation for all planned pages.

### Phase 2 — Persistence, authentication, and authorization

- [ ] T003 Define Drizzle schemas and migrations for users/roles, catalog, suppliers/purchase orders, stock movements, sales/cash payments, register sessions, customers/loyalty, settings, and audit events; configure clean initialization and isolated test databases.
- [ ] T004 Implement Thai-language login/logout UI, password hashing, session/cookie configuration, and protected API/page middleware.
- [ ] T005 Implement cashier/manager authorization, manager-only staff account creation/deactivation and role assignment, support one account holding both roles, and add reusable audit-event recording for protected operations.
- [ ] T006 Add Jest tests for migrations/constraints, authentication/session lifecycle, cashier-only and manager-only restrictions, dual-role access, and audit-event creation.

### Phase 3 — Catalog, purchasing, and inventory control (REQ-002, REQ-003, REQ-008, REQ-009, REQ-013)

- [ ] T007 Implement product list/search, create/update, archive/restore, optional SKU/barcode/category, and reorder threshold with validation.
- [ ] T008 Build Thai-language inventory/catalog UI with active/archived views and product maintenance.
- [ ] T009 Implement supplier and purchase-order workflows, including draft/cancel states and partial or complete delivery receiving.
- [ ] T010 Implement stock movement history and reasoned adjustments; ensure every receipt, sale, and adjustment writes a movement record.
- [ ] T011 Add low-stock views/alerts and tests for product validation, archive behavior, supplier/order permissions, partial receiving, movement history, and reorder thresholds.

### Phase 4 — Checkout, register, and sales records (REQ-004, REQ-005, REQ-006, REQ-010)

- [ ] T012 Implement register opening/closing, cash expected-versus-counted reconciliation, sale search/detail, and receipt reprint.
- [ ] T013 Implement session-scoped baskets and transactional/idempotent checkout associated with an open register, with server-calculated totals, payment recording, and stock revalidation.
- [ ] T014 Build Thai-language checkout and register pages, including receipt display and useful validation/error feedback.
- [ ] T015 Add Jest tests for basket and checkout edge cases, stock rollback, payment records, register reconciliation, and sales search/detail.

### Phase 5 — Customer loyalty (REQ-012)

- [ ] T016 Implement customer lookup/profile, optional customer association at checkout, and an append-only stamp earn/redeem ledger with persistent balances.
- [ ] T017 Add Jest tests for customer association, stamp accrual, redemption, and persistent balances.

### Phase 6 — Reporting, settings, and barcode workflow (REQ-012, REQ-013, REQ-014, REQ-015)

- [ ] T018 Implement manager reports for date-range sales, best-selling products, stock movements, inventory valuation, and low stock; support CSV export.
- [ ] T019 Implement manager-controlled discounts up to 100% and baht-per-stamp conversion settings with effective dates and audit events; calculate no tax and treat manager-entered product prices as final customer-facing prices. Retain cash as the only tender.
- [ ] T020 Implement stamp redemption using the configured conversion rate, prevent redemption beyond the subtotal after discounts, and record the redemption in the sale and loyalty ledger.
- [ ] T021 Support barcode-scanner keyboard input and SKU/barcode lookup at checkout; keep manual search available.
- [ ] T022 Add Jest tests for report totals/filters/exports, manager-only discount changes and sale snapshots, cash tender validation, stamp conversion/redemption, and barcode lookup.

### Phase 7 — Informational pages and release readiness (REQ-007 and cross-cutting)

- [ ] T023 Recreate the Thai-language home/help and management-team pages using existing copy/assets where appropriate; verify image attribution/rights before reuse.
- [ ] T024 Add end-to-end smoke coverage for seeded development login → receive stock → cash checkout → search/reprint sale → logout; document setup, migrations, roles, and test commands.
- [ ] T025 Run the full Jest suite and production builds; verify Thai content, responsive layout, keyboard access, financial calculations, and development seed safeguards.

## Acceptance Criteria

- Unauthenticated users cannot access protected screens or APIs. Cashier-only users cannot perform manager-only actions; an account with both roles can use both workflows. Sensitive actions record the actor and reason.
- Product operations validate all fields. Archived products are excluded from active inventory and checkout but can be restored; historical records remain intact.
- Purchase receiving, sales, and manual adjustments all produce traceable stock movements. Partial purchase receipts update only the quantities actually received.
- Checkout accepts cash only, recalculates prices and stock server-side, treats product prices as final customer-facing prices, applies the manager-configured discount (up to 100%), and does not calculate tax. Failed checkout changes no stock or sale records; a retried successful request cannot create a duplicate sale or stock deduction.
- Sales preserve product, final price, and discount snapshots. The app does not calculate or store tax and has no return, refund, or void workflow.
- Register closing reports expected cash, counted cash, and variance. Sales and inventory reports are derived from persisted records and reconcile with transaction detail.
- Customer association is optional; stamps accrue to an append-only ledger, can be redeemed using the manager-configured baht-per-stamp rate, and do not reset or expire.
- Development seed data is available only in non-production environments and does not contain a committed password.
- Returns/refunds/voids and application-managed backups are not available. Jest covers core business rules and failure paths; production builds pass.

## Confirmed Decisions

Confirmed decisions: start with a clean SQLite database and no legacy MySQL import; seed development with sample products and a local staff account using a locally supplied password, never production defaults; make all user-facing content Thai; archive products rather than delete them and allow restoration; accept cash only; managers enter final customer-facing product prices and the app does not calculate tax; managers configure discounts up to 100% and set the baht-per-stamp conversion rate; allow a user to hold both cashier and manager roles; do not support returns/refunds/voids, application-managed backups, or stamp resets/expiration.

## Requirement Mapping

| Requirement | Plan items | Evidence of completion |
|---|---|---|
| REQ-001 | T004, T006 | Thai login/logout, session middleware, protected routes, authentication tests |
| REQ-002 | T007, T008, T011 | Product list/search API, inventory/catalog UI, and tests |
| REQ-003 | T007, T008, T011 | Product create/update/archive/restore and validation tests |
| REQ-004 | T013, T014, T015 | Basket service/API, Thai checkout UI, and calculation tests |
| REQ-005 | T013, T014, T015, T019 | Cash validation, receipt response/UI, and checkout tests |
| REQ-006 | T003, T010, T013, T015 | Sale schema, transactional checkout, idempotency, stock movement, and rollback tests |
| REQ-007 | T002, T022, T023 | Thai home/help and management-team pages, navigation, setup docs |
| REQ-008 | T003, T009, T011 | Supplier, purchase-order, partial-receiving workflows and tests |
| REQ-009 | T003, T010, T011 | Inventory adjustments, movement history, low-stock view, and tests |
| REQ-010 | T003, T012, T015 | Register reconciliation, sales search/detail, receipt reprint, and tests |
| REQ-011 | T003, T005, T006 | Cashier, manager, and dual-role accounts; authorization and audit-event tests |
| REQ-012 | T003, T016, T017, T020, T022 | Customer profiles, optional sale association, persistent stamp ledger, baht-per-stamp redemption, and tests |
| REQ-013 | T003, T007, T008, T021, T022 | SKU/barcode/category fields, scanner workflow, and lookup tests |
| REQ-014 | T018, T022 | Report queries, CSV exports, and reconciliation tests |
| REQ-015 | T003, T019, T022 | Manager-configured discounts up to 100%, final manager-entered prices, no tax calculation, and tests |
