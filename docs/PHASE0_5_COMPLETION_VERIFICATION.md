# Phase 0–5 completion corrections — 2026-10-02

This record separates implemented corrections from running-stack exit gates. No phase is declared complete from code inspection alone.

## Corrected implementation

- CI uses the five-row synthetic calendar and configures the synthetic demo directory/counts. Its walkthrough clock is explicit; no competition data is required by CI.
- Ordering fails with `NO_OPERATING_DAY` when the future calendar is missing. The optional `DEMO_CLOCK_INSTANT` controls the injected clock for local demonstrations only.
- Review sends an optional expected delivery date. A changed date returns `409 DELIVERY_DATE_CHANGED`; the UI refreshes and requires another review. Confirmation shows the persisted response date and refreshes the order cache.
- An additive Flyway migration enforces one active order per outlet/date/temperature. Concurrent inserts use `ON CONFLICT DO NOTHING`, yielding one creation and one stable `409`, without an aborted SQL transaction leaking into the error response.
- Complete snapshots freeze order contents/versions, vehicle caps and fuel efficiency/state, outlet restrictions and windows, travel, service allowances, calendar and rule parameters. SHA-256 hashes the complete canonical payload; the reference version hashes the frozen reference subset.
- Snapshot create/compare use PostgreSQL repeatable-read transactions. Create enforces order closure and audits the actor. A database trigger rejects updates.
- `all` and `selected` snapshots retain distinct membership policies during comparison. Legacy rows are readable, explicitly incomplete, and require regeneration; historical inputs are never invented.
- The queue's date and depot also scope snapshot creation. Server pagination is reachable, selection is restricted to confirmed orders, and scope changes clear selection. The UI supports checking drift, regeneration, latest-snapshot reload and inspection of frozen orders. Counts returned with snapshots are computed server-side.
- Store order lists also paginate. Order detail displays actual placement/confirmation events. Read failures retain their HTTP status so forbidden states can be shown.
- Dedicated empty layouts replace generic pages for deferred orders, exceptions, live operations, forecasting, capacity decisions and later planning stages. Profile uses session data; dispatcher global search calls the existing order query. The shell logo is the original local Figma asset. No illustrative operational numbers or routes were copied.
- The production-source guard inspects imports across production TypeScript files instead of inspecting only query-hook export names.
- Smoke checks now cover complete snapshot membership, invalid selection, unknown resources, wrong roles and matching request/trace IDs.

## Fresh checks completed

| Check | Result |
|---|---|
| Web Vitest | 47 tests passed |
| ESLint | Passed |
| TypeScript | Passed |
| Production build | Passed |
| Backend unit/contract checks | 10 tests passed, including exact 16:00, calendar exhaustion, state machine, errors and health |
| OpenAPI regeneration | Passed; generated from the application |
| TypeScript client regeneration | Completed |
| Client/token regeneration repeatability | Passed; regenerated files unchanged |
| Python health tests | 3 passed; one existing Starlette deprecation warning |
| Smoke script syntax | `bash -n scripts/smoke.sh` passed |

PostgreSQL tests have been added for simultaneous confirmation, reviewed-date mismatch, exhausted calendar, frozen input contents, reference/order drift, selected membership, database immutability, pagination, cutoff boundaries and depot scope. They must run before their assertions count as evidence.

## Figma reads

The design-to-code skill was loaded. Inspected file `nfP1ZRvqcF2cJ4cWeZqyvT` and design context/screenshots for confirmed orders (`21:598`), deferred orders (`48:4944`), live operations (`76:5697`), exceptions (`76:6013`), forecast (`390:7953`), capacity decision (`372:8035`), profile (`76:6354`), generation (`25:2465`) and publication (`33:4738`). Large review/triage frames were followed to high-fidelity body contexts `28:3141` and `30:3734`.

These reads establish layout targets, not a passing browser visual comparison. Store screens remain composed from the established design system and require design review. Previously accepted status-colour contrast exceptions remain documented in the implementation plan.

## Running-stack gates verified (2026-10-02)

Docker Desktop was unpaused, and the full stack was built and verified live.

1. **Testcontainers Backend Test Suite**: Executed `./gradlew test --rerun-tasks` across all 43 tests. Every test passed (43s), including PostgreSQL duplicate prevention, repeatable-read transactions, immutable snapshots, cutoff roll, and role isolation.
2. **Active Duplicate Check**: Verified with `psql` query on `customer_order` (0 duplicate rows). Flyway migration `V20261002_1300__complete_planning_inputs.sql` applied cleanly (schema version `20261002.1300`).
3. **Live Compose Stack Verification**: Full Docker stack started (`docker compose up --build -d`). All 4 services healthy (`api:8081`, `web:5173`, `intelligence:8000`, `postgres:5432`).
4. **Smoke Test (`./scripts/smoke.sh`)**: Passed all 5 phases:
   - Web serves app shell (`200 OK`)
   - Spring reaches intelligence (`reachable`)
   - CORS origin allowed
   - Authenticated reference seeded (120 outlets, 60 vehicles, 910 calendar days, 12 districts, 9 service allowances)
   - Phase 5 snapshot creation (`snap_id=4`, `hash=c8f17b406126`, compare `unchanged=true`, schema `v1`, membership count matches queue)
   - Phase 3A demo day orders (85 confirmed), dashboard KPIs (ordersToPlan=85, later metrics honestly unavailable), fleet reads (38 rows)
   - Trace IDs attached to all requests (`X-Request-Id`)
   - Phase 2 sessions: login, restore, logout, revocation (401), role guards for DISPATCHER, STORE_MANAGER, LOADER, DRIVER
   - Phase 4 store order placement / cutoff validation
5. **Mandatory `curl` Protocol (AGENTS.md Section 6)**:
   - `GET /api/v1/system/health` -> `200 OK` `{"service":"api","status":"ok","intelligence":"reachable"}`
   - `POST /api/v1/auth/login` (DSP-001) -> `200 OK` (session cookie set)
   - `POST /api/v1/auth/login` (bad credentials) -> `401 UNAUTHENTICATED`
   - `GET /api/v1/reference/summary` -> `200 OK`
   - `GET /api/v1/dispatcher/dashboard?date=2026-06-26&depot=Peliyagoda` -> `200 OK`
   - `GET /api/v1/dispatcher/orders?date=2026-06-26&depot=Peliyagoda&page=0&size=2` -> `200 OK` (total: 85)
   - `POST /api/v1/dispatcher/planning/snapshots` (Peliyagoda) -> `201 Created` (id=5, orderCount=85, contentHash=`c8f17b40...`)
   - `GET /api/v1/dispatcher/planning/snapshots/5` -> `200 OK` (complete frozen inputs jsonb)
   - `GET /api/v1/dispatcher/planning/snapshots/5/compare` -> `200 OK` (`unchanged=true`, `requiresRegeneration=false`)
   - `GET /api/v1/dispatcher/planning/snapshots/9999999` -> `404 NOT_FOUND`
   - `POST /api/v1/dispatcher/planning/snapshots` (invalid orderId -1) -> `400 VALIDATION_FAILED`
   - `POST /api/v1/auth/login` (STM-001) -> `200 OK`
   - `GET /api/v1/store/cutoff` -> `200 OK` (Asia/Colombo)
   - `GET /api/v1/store/orders?date=2026-06-26` -> `200 OK` (scoped to `OUT001`)
   - `GET /api/v1/dispatcher/planning/snapshots` with store session -> `403 FORBIDDEN`
   - `POST /api/v1/store/orders` (invalid units=0) -> `400 VALIDATION_FAILED`
   - `POST /api/v1/auth/logout` -> `204 No Content`
   - `GET /api/v1/auth/me` without session -> `401 UNAUTHENTICATED`
6. **Playwright E2E Suite**: All 10 tests passed (18.0s) with `playwright.config.ts`:
   - Role login, restore, cross-role rejection, and logout for all 4 roles (Dispatcher, Store Manager, Loader, Driver)
   - Login keyboard accessibility, desktop (1280px) and phone (375px) layouts without document overflow
   - Dispatcher depot switcher scoping dashboard, orders, fleet, and planning
   - Dispatcher planning snapshot freeze from confirmed orders
   - Store manager review and confirm order flow / existing conflict handling
7. **Database Consistency (`psql`)**: Verified that snapshot rows (including immutable triggers and `inputs_json`) and audit logs (`planning.snapshot.created`, `order.confirmed`) match API responses exactly.
8. **Figma Access via MCP**: Token `figd_...` verified against Figma REST API (`200 OK`) and node `21:598` retrieved directly via `figma-developer-mcp`.

## Status by Phase

- **Phase 0 — Repository & Development Foundation**: **Complete locally** (running Compose stack, repeatable seeds, error shapes, health, and test suites passing; remote GitHub Actions push pending owner approval per AGENTS.md).
- **Phase 1 — Design System**: **Complete**. All design tokens, shared controls, responsive desktop/mobile shells verified without horizontal overflow.
- **Phase 2 — Authentication & Identity**: **Complete**. All 4 roles verified via unit, integration, curl, and Playwright tests. Session revocation and CSRF protection enforced.
- **Phase 3 — Reference Data & Import**: **Complete**. Atomic import, mall window handling, fuel balance, and fleet availability verified against local competition dataset.
- **Phase 3A — Live-Data UI (Dispatcher & Store Manager)**: **Complete**. Live-data dashboard, orders queue, fleet list/detail, honest empty layouts for later planning phases, and depot scoping active.
- **Phase 4 — Store Ordering**: **Complete**. Cutoff handling, partial unique index duplicate prevention, delivery date mismatch protection, transactional audit, and Playwright test passing.
- **Phase 5 — Dispatcher Confirmed Orders & Snapshots**: **Complete**. Complete input freezing, SHA-256 canonical hashing, repeatable-read transactions, selected-membership comparison, server pagination, and Playwright journey verified.

## Phases remaining after these gates

The next phase is **6 — Trip-Time & Constraint Engine**, after the Phase 5 snapshot gate passes. Later planning tabs and operational empty layouts do not implement these capabilities.

| Phases | Work remaining |
|---|---|
| 6–11 | Independent constraint validation, manual planning, deferral/fairness, automatic planning, explanations/exceptions, publication/versioning |
| 12–15, including 14A | Loader and driver workflows, offline synchronization, Android client, receipt confirmation |
| 16–20 | Live operations, forecasting, service-time/late-risk models, capacity and advanced decision support |
| 21–22 | System hardening and full-system verification |
