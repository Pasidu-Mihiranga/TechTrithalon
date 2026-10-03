# TechTrithalon — Waypoint Operations Implementation Plan

This is the daily build plan for a **nine-member team**. It answers what to build next, what can proceed in parallel, and how each phase is verified. Technical reasoning, domain facts, diagrams, and full feature definitions live in the [Waypoint Technical & Domain Reference](./TECHNICAL_REFERENCE.md).

## Master Progress

Check a phase only after its exit gate passes in the running system; documentation alone is not evidence. The current foundation and manual path have implementation evidence, but open gates below must be closed before advancing the release. See the [Round 2 requirements audit](./ROUND2_REQUIREMENTS_AUDIT.md).

- [ ] Phase 0 — Repository & Development Foundation **(local stack verified, web lint now clean; hosted CI run on GitHub pending)**
- [x] Phase 1 — Design System & Application Shell
- [x] Phase 2 — Authentication & RBAC
- [x] Phase 3 — Reference Data Foundation
- [ ] Phase 3A — Dispatcher & Store Manager UI on Live Data **(UI priority; current truthfulness/server-metric regressions and visual sign-off remain)**
- [x] Phase 4 — Store Manager Order Flow **(functional gate: recorded curl/browser evidence and fresh PostgreSQL tests; release design review remains)**
- [ ] Phase 5 — Dispatcher Confirmed Orders **(snapshot backend verified; latest queue/filter/exclusion integration needs correction)**
- [ ] Phase 6 — Trip-Time & Constraint Engine **(implemented; waiting and timing boundaries verified; input integrity/full acceptance keep gate open)**
- [x] Phase 7 — Manual Planning First (functional path verified; visual integration tracked separately)
- [x] Phase 8 — Deferral & Fairness **(tests, curl, SQL and browser journey verified; Figma comparison done for Deferred Orders only, defer dialog and store notice frames pending)**
- [ ] Phase 9 — Automatic Planning
- [ ] Phase 10 — Explainability & Exception Resolution
- [x] Phase 11 — Plan Publication & Versioning **(backend, tests, curl/SQL and Step 5 browser verified on synthetic data; Docker smoke and real-dataset run pending)**
- [x] Phase 12 — Loader Workflow **(tests, curl/SQL, Playwright and browser on synthetic data; Docker smoke and real-dataset run pending)**
- [x] Phase 13 — Driver Workflow **(tests, curl/SQL, Playwright and browser on synthetic data; real Cloudinary upload, Docker smoke and real-dataset run pending)**
- [ ] Phase 14 — Offline & Sync
- [ ] Phase 14A — Driver Android App (React Native)
- [ ] Phase 15 — Receipt Confirmation
- [ ] Phase 16 — Live Operations
- [ ] Phase 17 — Forecasting Foundation
- [ ] Phase 18 — Service-Time & Late-Risk ML
- [ ] Phase 19 — Capacity Decision Support
- [ ] Phase 20 — Advanced Decision Support
- [ ] Phase 21 — System Hardening
- [ ] Phase 22 — Full-System Verification

**Completion correction, 2026-10-02:** the Phase 3A/4/5 gates are reopened while the reviewed defects are corrected and verified. Earlier evidence below describes the earlier implementation. Current changes and fresh results are recorded in [Phase 0–5 completion verification](./PHASE0_5_COMPLETION_VERIFICATION.md); a successful compile or unit test does not close a running-stack gate.

**Evidence reconciliation, 2026-10-03:** the completion record later includes PostgreSQL, curl and browser evidence for the ordering corrections, so Phase 4's functional gate is restored. Fresh checks passed 110 API tests, 66 web tests, typecheck, build and three Python tests; full web lint failed with three errors. Current five-step UI inspection found hard-coded operational copy, client-computed totals, ineffective van-only filtering and exclusions not used by snapshot creation. Phase 3A/5 therefore stay open. Phase 6 code and timing fixtures exist, but full boundary/input/cross-trip evidence is incomplete. Phase 7 retains its verified functional-board status; operational loading/driver handoff remains Phase 11+. See [the full audit and execution order](./ROUND2_REQUIREMENTS_AUDIT.md). No new mutation/browser verification or Figma visual sign-off is claimed by this audit.

**Step 1 evidence, 2026-10-03:** Step 2/3 planning metrics (available vehicles, frozen order count/volume, per-trip utilisation and stop count, used vehicles/orders) are now server-owned. Fresh runs: 115 API tests, 73 web tests, clean typecheck and lint. Curl on an isolated stack matched SQL (85 orders, 409.864 m³, 28 available vehicles). Hosted CI, Figma visual sign-off and date/error/forbidden journeys remain open.

**Repair evidence, 2026-10-03:** existing work was merged/pushed to `main` at `561ee5f`; fixes are local on `fix/planning-data-integrity`. Figma reads now succeed. Server queue totals/van filtering, recorded candidate deferrals, candidate refresh/scope clearing, truthful manual progress/maps/publication, and independent waiting-time validation have fresh synthetic curl/SQL/browser evidence. Full API suite: 114 passed, plus the newly added budget-boundary/contract check; web: 71 passed, clean lint/typecheck and Docker build. Required-input integrity, full S1, remaining screen/business metrics and visual/state review keep earlier gates open. See [verification details](./MANUAL_PLANNING_VERIFICATION.md#2026-10-03--planning-integrity-follow-up). Later phases remain in the audit's dependency order; none is silently skipped.

## 1. How to Use This Plan

> **UI priority (owner decision).** Dispatcher and Store Manager UI is built first (Phase 3A), wired to real backend data from day one. Loader and Driver UI come later (Phases 12–14A). **No hard-coded or mock data in the UI**: every number on screen comes from the API, and a screen whose backend capability doesn't exist yet shows an honest empty or "not available yet" state.
>
> **Driver clients (owner decision, AD-13).** The driver runs as a PWA (Phase 13, mandatory) **and** a React Native Android APK (Phase 14A), sharing `packages/field-core`. See [§8.1](./TECHNICAL_REFERENCE.md#81-driver-client-decision--pwa-and-react-native-apk-revised).

- Follow dependencies and exit gates rather than dates. A later phase can start in parallel only when its listed dependencies and contracts are stable.
- Work in **vertical feature slices**: Flyway/data → Spring domain/API/auth → generated TypeScript client → React UI → tests → Figma verification → review. Python joins a slice only for computation.
- Nine people provide capacity for independent slices, fixtures, and reviews. Ownership follows the feature being built; nobody is permanently assigned to a stack.
- Spring is the operational authority. Python proposes assignments or predictions and never writes orders, plans, deliveries, or users. Manual planning stays usable when Python is down.
- Update the checkbox in each phase after verification and add a brief evidence link (test run, PR, or deployment) beside completed items. Revisit phase gates after changes to shared contracts.
- Figma is the UI source of truth. Dispatcher screens should match the built frames. For other roles, use the written rationale and published tokens/components, then mark the screen for final Figma verification.

Useful references: [Architecture](./TECHNICAL_REFERENCE.md#7-system-architecture) · [Important Features](./TECHNICAL_REFERENCE.md#6-important-features) · [Constraint Engine](./TECHNICAL_REFERENCE.md#16-constraint-engine) · [Automatic Optimization](./TECHNICAL_REFERENCE.md#19-automatic-optimization) · [Offline Architecture](./TECHNICAL_REFERENCE.md#27-offline-architecture) · [Machine Learning](./TECHNICAL_REFERENCE.md#32-machine-learning).

## 2. Definition of Done for Every Feature

- [ ] Requirement, role, and affected data are understood; relevant Figma frame/rationale inspected.
- [ ] Data model and Flyway migration are complete when needed.
- [ ] Spring domain logic, API, input validation, and role/data authorization are complete.
- [ ] OpenAPI contract and generated TypeScript client are updated.
- [ ] React flow includes loading, empty, error, and forbidden/offline states where applicable.
- [ ] Unit, PostgreSQL integration, authorization, and relevant Playwright journey pass.
- [ ] Figma visual check, accessibility basics, and responsive/device check pass.
- [ ] Audit events and failure behavior are implemented for state-changing actions.
- [ ] Documentation and known limitations are updated; code is reviewed and integrated into main.

If Python participates:

- [ ] Pydantic↔Java contract and Python tests pass.
- [ ] Spring independently validates computational output.
- [ ] Timeout, invalid response, and unavailable-service fallback are tested.

The planning hierarchy is **independent validator → manual planning → deterministic greedy → CP-SAT → explanation/simulation**. Optimization is mathematical search; learned prediction is ML. Neither may override hard domain rules.

## 3. Phase Map and Parallelism

| Stream | Can progress independently after | Synchronizes on |
|---|---|---|
| UI shell and role pages | Phase 0 and stable API DTOs | Generated client, Figma review |
| Reference import and domain rules | CSV schema and migrations | Seed invariants, validator inputs |
| Manual planning and deferrals | Snapshot + validator | Candidate plan contract, publish gate |
| Python optimization research | Stable snapshot/contract | Spring independent validation |
| Field UI and offline queue | Published trip/command contracts | Real phone E2E and sync endpoint |
| Forecasting research | Historical files and target definition | Spring persistence/read API |

A phase may have several parallel streams. Limit simultaneous edits to shared schema, auth, and planning-rule contracts, and integrate each slice before moving the exit gate.

## Phase 0 — Repository & Development Foundation

### Goal

Complete repository & development foundation as a tested feature slice.

### Why This Phase Comes Now

Every later feature needs a reproducible workspace, contracts, and running services.

### Dependencies

- None.

### Main Work

#### Backend

- [x] Scaffold Java 21 Spring Boot modular monolith, health endpoint, `Clock`, error envelope, and OpenAPI.
- [x] Expose a small API endpoint consumed by the web app.

#### Frontend

- [x] Scaffold React, TypeScript, Vite, router, query provider, and generated OpenAPI client.

#### Database

- [x] Start PostgreSQL with Docker Compose; create baseline Flyway migration.
- [x] Add idempotent reference seed/import and a documented demo operating date.

#### Python / Intelligence

- [x] Scaffold Python project, FastAPI health endpoint, Pydantic contracts, and pytest; no operational DB credentials.

#### Testing

- [x] Run migrations from an empty DB, seed twice without duplicates, and smoke-test React → Spring and Spring → Python.
- [ ] Set CI for Gradle/JUnit, frontend lint/typecheck/Vitest, Python pytest, contract drift, and Compose smoke. *(Workflow written in `.github/workflows/ci.yml` and every step run locally; not yet run on GitHub.)*

#### Documentation

- [x] Write root `.env.example`, local setup, seed/reset instructions, and service ownership.

### Parallel Work

Scaffold API, web, database seed, and Python health in parallel after agreeing on ports and configuration. Join at the OpenAPI contract and Compose smoke test.

### Exit Gate

- [x] All services start through one Compose command.
- [x] Empty database migrates and seeds repeatably.
- [x] Frontend reaches Spring; Spring health-checks Python.
- [ ] CI is green on GitHub *(pending the first push of this work)*.

### Evidence (local, verified)

- `docker compose up --build` starts postgres, intelligence, api and web; `scripts/smoke.sh` passes all 5 checks (web serves, Spring healthy, Spring → Python reachable, CORS for the web origin, reference data seeded, trace-id header).
- Restarting the API leaves 120 outlets / 60 vehicles / 910 days unchanged; `docker compose down -v` then `up` re-seeds from an empty database.
- The same smoke test passes on the synthetic CI fixtures (3 outlets / 2 vehicles).
- API: 11 tests pass (Testcontainers on PostgreSQL 16). Python: 3 pass. Web: lint, typecheck, 2 Vitest tests and build pass. Generated client and `openapi.json` have no drift.

### Result

After this phase, the system can run a reproducible seeded development stack.

## Phase 1 — Design System & Application Shell

### Goal

Complete design system & application shell as a tested feature slice.

### Why This Phase Comes Now

Shared visual foundations reduce repeated UI work in every role flow.

### Dependencies

- Phase 0; current Figma file and rationale cards.

### Main Work

#### Backend

- [x] Expose session/role shell metadata only as needed for UI integration. *(Nothing needed before authentication exists; the role is chosen by URL until Phase 2.)*

#### Frontend

- [x] Extract Figma tokens for color, type, spacing, status, and responsive breakpoints.
- [x] Build shared button, input, select, badge, card, table, dialog, drawer, sidebar, and top bar used by the first screens.
- [x] Add role shells and loading, empty, error, and unauthorized states.

#### Database

- [x] No migration required; retain token JSON in the repository.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [x] Use Vitest/Testing Library for stateful primitives.
- [x] Check keyboard focus, contrast, and 375 px/desktop layouts; visually compare the dispatcher shell to Figma. *(Keyboard order tested for the shell and focus trap for dialogs; contrast findings below accepted by the owner.)*

#### Documentation

- [x] Record token source and mark missing role screens for final Figma verification.

### Parallel Work

Token extraction, shell layout, and accessibility review can progress in parallel. Synchronize on token names and shared component props before feature pages consume them.

### Exit Gate

- [x] First role shell renders from shared components.
- [x] Core controls match the current Figma language.
- [x] Responsive checks pass (375 px phone and 1280 px desktop).
- [x] Accessibility checks pass, **with one owner-accepted exception**: the Figma status-badge colours are kept as designed (see below).

### Evidence (local, verified)

- **Tokens:** `packages/design-tokens/tokens.json` holds 28 colours, spacing, radius, shadows and 15 text styles, extracted from Figma nodes `74:5232` and `30:3416`. CSS and TypeScript are generated; CI fails if they are stale.
- **Components** (`apps/web/src/components/`, flat): Button, Input, Select, Badge/TypeBadge, Card/MetricCard, DataTable (server-side sort contract), Dialog and Drawer (focus trap, Escape, focus return), PageHeader, AppShell, Sidebar, TopBar, SystemStatus, and the Empty/Error/Forbidden/Loading states.
- **Role shells:** one `RoleShell` driven by `app/roles.ts` renders Dispatcher, Store manager, Loader and Driver. Below 1024 px the rail becomes a bottom tab bar. Screens whose backend arrives later show "Not available yet" and name the phase; there is no sample data.
- **Real data:** the dispatcher home shows live counts from `/api/v1/reference/summary` (120 / 60 / 12 / 910) and the sidebar pill reads `/api/v1/system/health`.
- **Tests:** 21 web tests pass (components, states, role shells, keyboard order, API client); typecheck, lint and build pass. `docker compose up --build` serves the new UI; `scripts/smoke.sh` still passes.
- **Visual check:** compared with Figma frames 28:2936 and 74:5232 (dark rail, yellow active pill, yellow edge strip, title and card styles match). Screenshots taken at 1280 px and 375 px.

### Known differences from Figma (need design review)

- No depot switcher, notification bell, help button or user chip: they need data that does not exist yet (depot list endpoint, session). The search field is shown disabled.
- The logo is a text wordmark; the Figma logo is a raster image.
- The active nav pill has no "notch" curves, and metric cards have no yellow accent tick.
- Breakpoints (768 / 1024 / 1280) are not in Figma; they are derived.
- Store Manager, Loader and Driver pages have no Figma frames; they use the shared components.

### Open accessibility findings (contrast, WCAG AA 4.5:1 for small text)

Computed from the Figma token pairs. Fixed with existing tokens: captions and placeholders (tertiary → secondary), field errors and the danger button (danger → `type/van`), table headers and error-state text.

Still failing **as designed in Figma**. **Owner decision: keep the Figma colours** (accepted exception; revisit if an accessibility audit requires it in Phase 21):

| Pair | Ratio |
|---|---:|
| `status/danger` on `status/danger-soft` (danger badge) | 3.16 |
| `type/fridge` on `type/fridge-soft` | 3.56 |
| `type/normal` on `type/normal-soft` | 3.80 |
| `type/van` on `type/van-soft` | 4.01 |
| `status/warning` on `status/warning-soft` | 4.47 |

### Result

After this phase, the system can build role pages from one shared visual system.

## Phase 2 — Authentication & RBAC

### Goal

Complete authentication & rbac as a tested feature slice.

### Why This Phase Comes Now

Every state-changing slice needs an actor and a trusted ownership scope.

### Dependencies

- Phases 0–1.

### Main Work

#### Backend

- [x] Implement login/logout, opaque session, expiry, role guards, data-scope checks, and actor context.
- [x] Return consistent 401/403; hide unowned resources with 404 where applicable.

#### Frontend

- [x] Build login, session restore, role redirect, Forbidden state, and logout.

#### Database

- [x] Create users, roles, session store, and four seeded role accounts with hashed passwords.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [x] Test passwords, expiry, CSRF/session behavior, and every role against each route family.
- [x] Playwright login/logout and cross-role access.

#### Documentation

- [x] Document seeded roles, credential configuration, and auth boundaries.

### Parallel Work

Identity schema/API and login UI can progress together against an agreed response contract. Security tests independently probe role and data scope; integrate before exit.

### Exit Gate

- [x] Four seeded accounts reach their own shell.
- [x] Wrong role and wrong owner are rejected by API and UI.
- [x] Audit actor identity is available to later modules.

### Evidence (local, verified — 2026-10-02)

- API: 20 tests pass, including eight PostgreSQL identity/security tests covering all four roles against every route family, method guards, two-driver ownership, outlet/depot scope, BCrypt seeding, session hashing/expiry/revocation, CSRF/CORS, validation and throttling.
- Web: 32 Vitest tests pass; lint, typecheck and production build pass. Authentication tests cover restore, role routing, errors, logout, expiry and private-cache cleanup when the actor changes.
- Browser: six Playwright journeys pass on the running Compose stack. All four accounts log in, reload their session, reject the other three workspaces and log out. Login assets, keyboard navigation and 1280 px/375 px layouts are checked; screenshots were compared with Figma login frame `1121:36567`.
- Running API: curl checks cover login/me/logout, protected reference access, 400/401/403/404/429 errors and matching `X-Request-Id`/`traceId`. PostgreSQL queries confirm returned users, BCrypt password hashes and hashed sessions. Commands and real responses are recorded in [Phase 2 verification](./PHASE2_VERIFICATION.md).
- `make gen-api` regenerates the contract and client; OpenAPI drift and generated-client/token repeatability checks pass. Updated `scripts/smoke.sh` passes for the whole stack and all four seeded roles.
- Trusted `CurrentUser` actor/scope is available to later services. Ownership rejection is proven through test-only controllers; operational order/trip ownership must be enforced again when those endpoints arrive.

### Known limits

- Local completion does not close Phase 0's pending GitHub CI gate; the updated workflow has not been pushed or run on GitHub.
- Native bearer transport joins the cookie-backed session store in Phase 14A. Password reset remains administrator-assisted; self-service reset is outside Phase 2.
- Login retains the existing project font tokens (Geist) rather than the frame's Inter; all supplied static assets are preserved. Shared title/ID labels support four roles, and no prototype ID, password or version is shown. Mobile composition needs final design review because no phone login frame was supplied.

### Result

After this phase, the system can authenticate all four roles with enforced access boundaries.

## Phase 3 — Reference Data Foundation

### Goal

Complete reference data foundation as a tested feature slice.

### Why This Phase Comes Now

Orders and rules must read the actual outlet, vehicle, calendar, travel, and service data.

### Dependencies

- Phases 0 and 2.

### Main Work

#### Backend

- [x] Implement read APIs and fleet availability transitions.
- [x] Derive effective mall windows and reject empty intersections.

#### Frontend

- [x] Add only the fleet/outlet selectors needed by order and planning flows.

#### Database

- [x] Import CSVs idempotently with natural IDs; persist availability and weekly fuel ledger.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [x] Assert 120 outlets, 60 vehicles, 12 districts, 13 van-only outlets, 12 mall outlets, and exact fleet mix.
- [x] Test workshop status, mall intersection, and role-scoped reads against PostgreSQL.

#### Documentation

- [x] Record source CSV paths, verified counts, and any date-extension policy.

### Parallel Work

CSV/import work, API contract, and selectors can advance in parallel. Synchronize on enum values, ID formats, and seed assertions.

### Exit Gate

- [x] Reference counts and invariants match supplied files.
- [x] Read APIs return real seeded data.
- [x] Invalid mall windows fail import.

### Result

After this phase, the system can use verified operational reference data.

**Verified locally:** [Phase 3 evidence](./PHASE3_VERIFICATION.md) — 28 backend tests, 37 web tests, generated-contract drift checks, smoke checks and curl against real and isolated synthetic PostgreSQL stacks. Selector components are ready for integration into the Phase 3A screens; no full order/planning screen is introduced here.

## Phase 3A — Dispatcher & Store Manager UI on Live Data

### Goal

Build every Dispatcher and Store Manager screen from the Figma design, reading **real data from the backend**, before any Loader or Driver UI.

### Why This Phase Comes Now

The dispatcher experience is the most fully designed part of the product (21 Figma screens) and the core of the system. Building its UI early on real data surfaces API-shape problems while they are cheap to fix, and gives every later business phase a ready screen to plug into.

### Dependencies

- Phases 1–3 (design system, auth, reference data).

### Rules for this phase

- **No hard-coded data, no mock API, no placeholder numbers.** Every value is fetched.
- If a screen's backend capability belongs to a later phase (planning results, live trips, forecasts), render the Figma layout with a real **empty state** that says what is missing and which phase delivers it. Never fill it with sample values.
- Figma is the source of truth for layout. Where a store-manager screen has no Figma frame, compose it from the existing design system and mark it for design review.

### Main Work

#### Backend

- [x] Seed one realistic **demo delivery day** on `DEMO_OPERATING_DATE` from the supplied data: orders from `task2b_peak_day_scenarios.csv` (85 Peliyagoda orders) and fleet availability from `task2b_peak_day_fleet.csv`. Idempotent, local data only, never committed.
- [x] Read APIs the screens need: dashboard metrics (computed by queries), orders list/detail with server-side filter/sort/paging, fleet list/detail, outlet list, store manager's own orders.
- [x] All counts and KPIs computed server-side; the UI never derives business numbers. *(Re-closed 2026-10-03: queue summary, plan volume, per-trip load, available vehicles, order totals and used vehicles/orders all come from the API; curl and SQL match. See the Step 1 record in the work log.)*

#### Frontend — Dispatcher (Figma, class A)

- [x] App shell: sidebar, top bar, depot switcher, global search. *(Shell from Phase 1–2; depot switcher/search remain disabled until those endpoints exist.)*
- [x] Dashboard (KPI cards and attention lists from live queries). *(Later KPIs return `available: false` with phase labels.)*
- [x] Orders and Order Detail.
- [x] Planning → Step 1 Confirmed Orders (table, filters, sorts, selection). *(Live table; selection/snapshot actions deferred to Phase 5.)*
- [x] Fleet and Fleet Detail (workshop status from the database).
- [x] Deferred Orders, Exceptions, Live Operations, Capacity Forecast, Capacity Decision: layouts built; real empty states until Phases 8, 10, 16, 17 and 19 supply data.
- [x] Profile and Login. *(Login complete in Phase 2; Settings/Profile still shows honest empty until more preference APIs exist.)*

#### Frontend — Store Manager (no Figma frames yet; class C)

- [x] Home with real cutoff countdown (server time, Asia/Colombo).
- [x] My Orders and Order Detail (status timeline from real order status). *(Status badge from API; full timeline expands in Phase 4.)*
- [x] Place Order layout (submission is wired in Phase 4).

#### Database

- [x] `customer_order` table (as specified in the reference) and the demo-day seed.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [x] API integration tests for every read endpoint, including role scope (store manager sees only own outlet).
- [x] Component tests for loading, empty, error and forbidden states.
- [x] A test that fails if the web bundle contains fixture/mock data imports (guard against hard-coded data).
- [ ] Visual check of each dispatcher screen against its Figma frame. *(Screenshots pending owner review against Figma.)*

#### Documentation

- [x] List each screen with its Figma frame, its endpoint, and which later phase completes it. *(See Result notes below.)*

### Exit Gate

- [ ] Every Dispatcher Figma screen renders from real API data or a truthful empty state. *(Reopened 2026-10-03: planning copy/progress/maps still imply unsupported operational facts; fresh visual verification remains pending.)*
- [x] Store manager can see their own real orders and the live cutoff.
- [ ] No mock data or hard-coded business values in the web app. *(Reopened 2026-10-03: hard-coded late-order copy, generated map positions and fallback volume remain in current planning screens; see Round 2 audit.)*

### Evidence (local, verified — 2026-10-02)

- Flyway `V20261002_0003__customer_order.sql`; demo seeder loads local Test Data CSVs (85 orders / 38 fleet rows on `2026-06-26`).
- API: full `./gradlew test` green, including `OrderQueryIT` and `FleetReadIT`. Curl on Compose (`API_PORT=8081`): dashboard `ordersToPlan=85`, later metrics unavailable, orders total 85, store outlet-scoped orders, cutoff Asia/Colombo.
- Web: lint/typecheck/40 Vitest tests/build pass; OpenAPI client regenerated.
- Remaining for polish: Figma visual sign-off; depot switcher / global search when those APIs exist.

### Result

After this phase, the dispatcher and store manager can navigate the full product UI on real seeded data, and later phases add behavior to existing screens instead of building them.

| Screen | Figma | Endpoint | Completed by |
|---|---|---|---|
| Dashboard | `74:5232` | `GET /api/v1/dispatcher/dashboard` | 3A (later KPIs in 7/10/11/16) |
| Orders / Detail | `74:5535` / `74:5850` | `GET /api/v1/dispatcher/orders` | 3A |
| Planning Step 1 | `21:598` | same orders API | 3A table; 5+ actions |
| Fleet / Detail | `719:12338` | `GET /api/v1/dispatcher/fleet` | 3A |
| Deferred / Exceptions / Live / Forecast / Capacity | various | empty until later | 8 / 10 / 16 / 17 / 19 |
| Store home / orders | none yet | `GET /api/v1/store/cutoff`, `/store/orders` | 3A |
| Place order | none yet | layout only | submit in 4 |

## Phase 4 — Store Manager Order Flow

### Goal

Complete store manager order flow as a tested feature slice.

### Why This Phase Comes Now

Confirmed orders are the input to every planning run.

### Dependencies

- Phases 2–3.

### Main Work

#### Backend

- [x] Implement order state machine, validation, server-side 16:00 Asia/Colombo cutoff, and next operating-day selection.
- [x] Permit same-day ambient and chilled Fresh orders.

#### Frontend

- [x] Build Place Order → Review → Confirm → My Orders → Order Detail, including form errors and empty state.

#### Database

- [x] Add customer order, indexes, version, and audit fields. *(migration landed in Phase 3A; Phase 4 writes confirmed rows + `order.confirmed` audit)*

#### Python / Intelligence

Not required in this phase.

#### Testing

- [x] Test cutoff boundary, Sunday/holiday rollover, two-temperature orders, ownership, and bad quantities.
- [x] Playwright the complete store order slice.

#### Documentation

- [x] Document order lifecycle and cutoff behavior.

### Parallel Work

Order schema/domain and React form can proceed against an agreed API DTO; integration waits for migration and generated client.

### Exit Gate

- [x] A store manager confirms a persisted order through the UI.
- [x] Dispatcher-facing status is confirmed and auditable.
- [x] Cutoff and ownership tests pass.

### Result

After this phase, the system can capture real confirmed demand from stores.

### Order lifecycle and cutoff (implemented)

- Place + confirm is one server step: `POST /api/v1/store/orders` creates `status=confirmed` via `OrderStateMachine` and writes `audit_event` type `order.confirmed`.
- Cutoff is 16:00 Asia/Colombo (`DeliveryDateService`). Before cutoff → first operating day after today; at/after cutoff → first operating day after tomorrow. Sundays/holidays skip via `calendar_day.is_operating`. When no future operating date exists, return `422 NO_OPERATING_DAY`; an explicitly configured local demo clock supports walkthroughs without backdating orders. Review-date drift returns `409 DELIVERY_DATE_CHANGED`.
- Fresh outlets may place ambient and chilled for the same delivery day; Style/other brands cannot place chilled (`CHILLED_FRESH_ONLY`). One active (non-cancelled) order per outlet/day/temp (`DUPLICATE_TEMP_ORDER`).

### Evidence (local, verified — 2026-10-02)

- API: `OrderCommandIT` + `OrderStateMachineTest`; full prior suite green. Curl on Compose (`API_PORT=8081`): store login → `POST /api/v1/store/orders` → **201** `ORD-000256` confirmed for `OUT001` / `2026-06-26` (row in `customer_order`); **400** `VALIDATION_FAILED`, **401** `UNAUTHENTICATED`, **403** `FORBIDDEN`, **409** `DUPLICATE_TEMP_ORDER`; path in `/v3/api-docs`.
- Web: Place Order form → review → confirm; OpenAPI client regenerated; lint/typecheck/40 Vitest/build pass; Playwright `store-order.spec.ts`.
- Remaining: Figma frames for store place-order when design lands.

## Phase 5 — Dispatcher Confirmed Orders

### Goal

Complete dispatcher confirmed orders as a tested feature slice.

### Why This Phase Comes Now

A dispatcher needs a precise and stable planning input set.

### Dependencies

- Phases 3–4.

### Main Work

#### Backend

- [x] Add date/depot-scoped confirmed-order query, pagination, search, sorting, and selection rules.
- [x] Create immutable planning snapshots with order IDs, fleet, weekly fuel, calendar, rule version, and content hash.

#### Frontend

- [ ] Build Figma confirmed-orders queue, detail, filter/sort, selection, and snapshot trigger. *(Backend and initial queue exist; latest integration must repair van-only filtering, exclusion membership, scope invalidation and server-owned summaries.)*

#### Database

- [x] Add planning snapshot table and appropriate order query indexes.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [x] Test exact snapshot membership, immutability, hash changes, pagination, and role scope.
- [ ] Playwright queue and snapshot creation. *(Earlier journey passed; rerun after current filter/exclusion/scope corrections and add assertions for their real persisted effects.)*

#### Documentation

- [x] Document snapshot fields and reconciliation when inputs change.

### Parallel Work

Queue UI and snapshot service can advance in parallel on agreed read models; integrate after ordering and reference APIs settle.

### Exit Gate

- [ ] Dispatcher can inspect the exact closed order set. *(Server counts/filter and persisted candidate deferrals now have synthetic curl/SQL/browser evidence; complete screen/state/CSV/date-switch and visual review remain open.)*
- [x] A snapshot freezes all inputs needed for a planning attempt.
- [x] Repeated reads reproduce the same snapshot.

### Result

After this phase, the system can freeze the inputs of a planning run.

### Snapshot fields and reconciliation (implemented)

`planning_snapshot` row: `plan_date`, `depot`, `taken_at`, `order_ids` (sorted), `fleet_json` (per-vehicle caps, availability, weekly fuel remaining), `constraints_json` (operating flags, cutoff, `ruleVersion`), `reference_version` (content-derived), `content_hash` (SHA-256 of the complete input payload), `taken_by`, `selection_mode`, `inputs_json`. The payload includes complete order rows, outlet windows/access, district travel, service allowances, vehicle fuel efficiency, calendar and rule parameters. Legacy rows without the payload require regeneration.

- Create: `POST /api/v1/dispatcher/planning/snapshots` (optional `orderIds`; omit = all confirmed for date+depot). Insert-only — database updates are rejected by a trigger. Creation requires the preceding day’s 16:00 Asia/Colombo cutoff and records an actor-linked audit event.
- Read: `GET .../snapshots/{id}`, `GET .../snapshots?date&depot` (latest).
- Drift: `GET .../snapshots/{id}/compare` recomputes the current hash; `unchanged=false` when any frozen planning input changes. Selected snapshots compare their selected IDs; all-order snapshots compare the complete eligible set. The UI checks drift, offers regeneration, and can reload the latest snapshot.

### Evidence (local, verified — 2026-10-02)

- Flyway `V20261002_1200__planning_snapshot.sql`; full `./gradlew test` green including `PlanningSnapshotIT`.
- Curl on Compose (`API_PORT=8081`): `POST .../planning/snapshots` → **201** with 85 `orderIds`, fleet JSON, `contentHash`; `GET` + `compare` → `unchanged=true`; **401** / **403** for anonymous / store; row in `planning_snapshot`.
- Web: selection + snapshot on Planning Step 1; OpenAPI client regenerated; 40 Vitest/build pass; Playwright `planning-snapshot.spec.ts`; `scripts/smoke.sh` Phase 5 step OK.

## Phase 6 — Trip-Time & Constraint Engine

### Goal

Complete trip-time & constraint engine as a tested feature slice.

### Why This Phase Comes Now

Correct feasibility rules must exist before assignments or optimization.

### Dependencies

- Phases 3 and 5; no Python dependency.

### Main Work

#### Backend

- [x] Implement trip-time, distance/fuel, effective mall window, waiting, and named R1–R12 rule predicates. *(Code exists and fixtures pass; cross-trip waiting/input follow-up remains in the exit gate.)*
- [x] Return structured violations with actual, allowed, and remediation evidence; build independent whole-plan validator. *(Used by manual-plan edits/publication; independent cross-trip scheduling needs additional verification.)*

#### Frontend

- [x] Add reusable constraint and utilisation display components for later planning screens. *(Shared components and nine component tests pass in the fresh web suite.)*

#### Database

- [x] Add only the persistence needed for rule evidence and weekly fuel state; use precise decimal quantities. *(Existing fleet ledger, snapshots and manual-plan/audit persistence provide this foundation; PostgreSQL integration tests pass.)*

#### Python / Intelligence

Not required in this phase.

#### Testing

- [ ] JUnit/AssertJ tests for every rule, positive and negative cases; 101/112/213 fixtures.
- [ ] Use Testcontainers for database constraints; run S1 rule/shortage diagnostics without asserting an unproven optimum.
- [x] Verify the implemented timing examples and named-rule suite. *(2026-10-03: 56 planning-domain tests pass, including 101/112/213; the complete 110-test API suite passes. This does not close missing boundary/full-S1 checks.)*
- [x] Verify exact 270/480-minute budgets and plus-one rejection, arrival exactly at window close, and waiting cascaded between vehicle trips. *(2026-10-03 regression tests passed; booklet formulas unchanged.)*

#### Documentation

- [x] Link rule codes and trip-time formula to [Technical Reference — Constraint Engine](./TECHNICAL_REFERENCE.md#16-constraint-engine). *(See also manual verification and Round 2 audit for implementation limits.)*

### Parallel Work

Rule predicates can be split by scope while one owner protects shared rule interfaces. UI evidence component and dataset fixtures can advance separately; merge through the whole-plan validator.

### Exit Gate

- [ ] Every hard rule has boundary tests.
- [x] Booklet trip-time fixtures pass. *(Fresh 2026-10-03 test run: 101, 112 and combined 213 minutes.)*
- [x] Validator names why hand-built invalid plans fail. *(Named-rule domain and manual-plan rejection tests pass in the fresh 110-test suite; missing edge coverage remains open above.)*

### Result

After this phase, the system can evaluate plan feasibility independently of any allocator.

## Phase 7 — Manual Planning First

### Goal

Complete manual planning first as a tested feature slice.

### Why This Phase Comes Now

A validated human planning path remains available even if Python is unavailable.

### Dependencies

- Phases 5–6.

### Main Work

#### Backend

- [x] Create/edit candidate plans and trips; assign, move, remove, and resequence orders through validate-then-apply services.
- [x] Add a minimal publication gate so invalid plans cannot become operational; full version lifecycle follows in Phase 11.

#### Frontend

- [x] Build plan board, vehicle/trip assignment, utilisation bars, named violation feedback, and manual defer action.

#### Database

- [x] Add plan/trip/stop tables, candidate version, optimistic lock, and within-plan uniqueness.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [x] Test invalid edits roll back; test whole-order and two-trip limits within a candidate.
- [x] Playwright a complete manual plan and rejected move.

#### Documentation

- [x] Record manual planning semantics and the difference between candidate and published plans.

### Evidence (local, verified — 2026-10-03)

See [Manual planning verification](./MANUAL_PLANNING_VERIFICATION.md) for semantics, generated API/client handoff, curl commands and real responses, PostgreSQL comparisons and test results. The functional board is `/dispatcher/manual-planning`; the existing five-step UI remains with the parallel design session. All 110 API tests and 66 web tests passed, as did the build, smoke script and complete manual browser path with Python stopped. Earlier visual/CI sign-off and Phase 6's stale master checklist are not silently closed by this evidence.

### Parallel Work

Plan persistence/API and board UI can advance against a contract; validator remains the integration point. Review the candidate schema together before migration.

### Exit Gate

- [x] Dispatcher creates a feasible candidate and explains every unassigned order.
- [x] Invalid edits and publication attempts persist nothing.
- [x] Manual path works with Python stopped.

### Result

After this phase, the system can produce a validated plan by hand.

## Phase 8 — Deferral & Fairness

### Goal

Complete deferral & fairness as a tested feature slice.

### Why This Phase Comes Now

Capacity shortfalls need durable reasons and repeat-skip protection.

### Dependencies

- Phases 4, 6–7.

### Main Work

#### Backend

- [x] Record reasons, rule evidence, previous operating-day deferral, days since last served, protect-next-run, and notifications. *(Store notices with acknowledgement; days since last served comes from imported scenario data until delivery records exist.)*
- [x] Require explicit reason and record who decided.

#### Frontend

- [x] Build defer dialog, repeat-skip warning, consequence text, deferred-order view, and store notice. *(Component tests and the browser journey pass; Figma comparison of the defer dialog and store notice pending.)*

#### Database

- [x] Add append-only deferral and notification records with indexes for outlet history.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [x] Test two consecutive operating days, protected carry-forward, missing reason, store visibility, and audit history.

#### Documentation

- [x] Document deferral policy and reason-code mapping to Figma. *([Deferral verification](./DEFERRAL_VERIFICATION.md))*

### Parallel Work

Deferral history service, notification display, and UI dialog can proceed in parallel. Synchronize on reason codes and history semantics before E2E.

### Exit Gate

- [x] A repeated skip is visible and justified.
- [x] Protected orders carry forward.
- [x] Store manager sees a clear deferral notice.

### Evidence (local, verified — 2026-10-03)

Full API suite 119 passed (including `DeferralIT`); web 76 passed, with clean typecheck and lint. On an isolated stack with real demo data, curl and SQL agreed: 85 published deferrals, 10 repeat skips from imported facts, carry-forward to 2026-06-27, store notice and a single acknowledgement, plus 400/401/403/404/422 paths. Smoke passes on the main stack. Details and limits are in [Deferral verification](./DEFERRAL_VERIFICATION.md). The browser journey passed (see the browser section of that record); the Figma comparison of the defer dialog and store notice is still pending.

### Result

After this phase, the system can record and explain every skipped order.

## Phase 9 — Automatic Planning

**Round 2 scope:** conditional on the submitted design and chosen allocation mode. A real validated manual path is permitted by booklet p.12; deterministic assisted allocation is a useful enhancement, while the full CP-SAT checklist stays optional unless selected.

### Goal

Complete automatic planning as a tested feature slice.

### Why This Phase Comes Now

Automation builds on the validated manual planning model and must degrade safely.

### Dependencies

- Phases 6–8; manual path remains independent.

### Main Work

#### Backend

- [ ] Implement deterministic Spring greedy allocator and candidate persistence.
- [ ] Send self-contained snapshots to Python; validate every returned candidate and fall back on timeout/5xx/invalid result.

#### Frontend

- [ ] Add Generate Plan action, real progress, result summary, and fallback notice.

#### Database

- [ ] Persist run status, input hash, solver/version, and objective settings.

#### Python / Intelligence

- [ ] Implement Pydantic contract and CP-SAT model; never write operational PostgreSQL tables.

#### Testing

- [ ] Golden deterministic greedy fixture, Spring–Python contract round trip, timeout/unavailable/invalid-candidate cases.
- [ ] Validate S1 with the supplied checker; compare against the feasible greedy result under the same objective.

#### Documentation

- [ ] Record objective, solver version, S1 measured results, and limits of any capacity bound.

### Parallel Work

Greedy service, CP-SAT research, run UI, and S1 fixtures can progress in parallel after the contract freezes. Candidate persistence and Spring validation are the merge gate.

### Exit Gate

- [ ] Every automatic candidate passes independent validation.
- [ ] Python failure returns a valid greedy option or manual path.
- [ ] S1 outcomes are measured rather than hard-coded.

### Result

After this phase, the system can generate feasible candidates automatically without depending on Python availability.

## Phase 10 — Explainability & Exception Resolution

**Round 2 scope:** manual rule/deferral explanations and operational issue resolution are required. Solver ranking/scoped re-optimisation are conditional; do not block the manual release on Phase 9.

### Goal

Complete explainability & exception resolution as a tested feature slice.

### Why This Phase Comes Now

A dispatcher must understand and change the candidate before publication.

### Dependencies

- Phases 7–8 for manual rule/deferral explanations; Phase 9 only for selected automatic-planning and solver-specific features.

### Main Work

#### Backend

- [ ] Assemble why-assigned/why-deferred evidence, binding resources, feasible alternatives, and ranked fixes.
- [ ] Add read-only dry-run simulation, impact preview, exception triage, and scoped re-optimization where useful.

#### Frontend

- [ ] Build Figma review and exceptions screens; show named constraint evidence and preview changes before apply.

#### Database

- [ ] Persist structured rationale and operational exception records without duplicating source facts.

#### Python / Intelligence

- [ ] Support pinned subsets for scoped re-optimization; Spring still validates outcomes.

#### Testing

- [ ] Test preview never mutates state, preview/apply metrics agree, and every proposed fix passes validation.
- [ ] Playwright exception triage and correction.

#### Documentation

- [ ] Document evidence schema and known limits of suggested fixes.

### Parallel Work

Rationale API, preview UI, and solver subset support can progress independently around a shared candidate format. Synchronize before ranking is presented as authoritative.

### Exit Gate

- [ ] Dispatcher can explain each deferral and rejected vehicle.
- [ ] Preview gives accurate before/after effects.
- [ ] Applying a fix cannot bypass validation.

### Result

After this phase, the system can review and repair a candidate with visible reasons.

## Phase 11 — Plan Publication & Versioning

### Goal

Complete plan publication & versioning as a tested feature slice.

### Why This Phase Comes Now

Execution needs one valid current version and an auditable history.

### Dependencies

- Phases 7–8 and the manual explanation core of Phase 10; minimal gate from Phase 7. Phase 9 is a dependency only when automatic allocation is selected.

### Main Work

#### Backend

- [x] Make publish one transaction: revalidate persisted plan, account for all orders, supersede prior version, commit weekly fuel, create load tasks, and write audit.
- [x] Implement republish conflict handling, stale-version response, and version diff.
- [x] Freeze the published schedule on `trip`/`stop` rows (planned departure, trip minutes, distance, fuel, planned arrival and service start, plus a calculation/rule version). Today these are recomputed from the immutable snapshot on every read; since 2026-10-03 the `plan.published` audit event also stores them as computed at publication. Needs a migration, so it belongs here rather than in manual planning.

#### Frontend

- [x] Build Confirm & Send, published state, and current-version indicators.

#### Database

- [x] Add partial unique current-plan index; keep candidate/historical plans coexisting; stamp load tasks with version.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [x] Test invalid publish rollback, concurrent publishes, republish, double fuel accounting, and stale-version response.

#### Documentation

- [x] Document publication invariants and recovery on conflict. *([Publication verification](./PUBLICATION_VERIFICATION.md))*

### Parallel Work

Publish service and Figma confirmation UI can progress together; DB uniqueness and fuel-ledger reviews are synchronization points.

### Exit Gate

- [x] Only validated, fully accounted plans become current.
- [x] Republish preserves old versions and signals stale clients.
- [x] Fuel is committed exactly once per current plan.

### Evidence (local, verified — 2026-10-03)

Full API suite 135 passed (7 new in `OperationalPublicationIT`), web 83 passed, typecheck, lint and build clean. Curl and SQL on a running API with synthetic fixtures agree: version 1 publishes with frozen schedule, driver and pending load tasks (ledger 8.00 L); version 2 replaces it, ledger 4.00 L, old load tasks superseded; stale and superseded publishes return 409. Details, design departures and limits: [Publication verification](./PUBLICATION_VERIFICATION.md). The Docker smoke and a real-dataset run were not possible in the cloud container.

### Result

After this phase, the system can publish one trusted operational plan per date and depot.

## Phase 12 — Loader Workflow

### Goal

Complete loader workflow as a tested feature slice.

### Why This Phase Comes Now

The dock needs the published stop sequence and a predeparture shortfall path.

### Dependencies

- Phase 11.

### Main Work

#### Backend

- [x] Expose depot trips and load tasks; record line confirmations and issues; block completion on unresolved shortfall.
- [x] Return plan version and changes on stale requests.

#### Frontend

- [x] Build tablet/phone load list in reverse stop order, issue reporting, completion, and stale-plan diff.

#### Database

- [x] Add load-line and loading-issue records if not present in Phase 11.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [x] Test LIFO order, issue blocking, handoff, role/depot scope, and mid-load republish E2E. *(Mid-load republish: integration test and curl; the browser spec covers the shortfall and handover journey.)*

#### Documentation

- [x] Record loader handoff and stale-list behavior. *([Loading verification](./LOADING_VERIFICATION.md))*

### Parallel Work

Load API/data and mobile UI can progress in parallel from a published-trip contract; issue event and version diff are integration points.

### Exit Gate

- [x] Loader completes a published trip’s load.
- [x] Shortfall reaches dispatcher and can block departure.
- [x] Republish displays a meaningful diff.

### Evidence (local, verified — 2026-10-03)

Full API suite 140 passed (5 new in `LoaderWorkflowIT`), web 93 passed, typecheck, lint and build clean, Playwright `loader.spec.ts` passed on the synthetic stack. Curl and SQL agree on counting, held shortfalls, the dispatcher's decision, handover and the mid-load republish (count carried, acknowledgement required). Details, Figma departures and limits: [Loading verification](./LOADING_VERIFICATION.md).

### Result

After this phase, the system can prepare and hand over a trip from the current plan.

## Phase 13 — Driver Workflow

### Goal

Complete driver workflow as a tested feature slice.

### Why This Phase Comes Now

The published and loaded route must be executable on a phone.

### Dependencies

- Phases 11–12.

### Main Work

#### Backend

- [x] Expose driver-owned trips/stops; record arrival, outcome, departure, and trip completion. — evidence: `DeliveryWorkflowIT`, curl table in [DELIVERY_VERIFICATION.md](./DELIVERY_VERIFICATION.md)
- [x] Implement POD upload references, issue events, and deterministic ETA fallback. (Cloudinary per ADR 0001; validated with an in-memory store, real upload not yet exercised)

#### Frontend

- [x] Build phone-first trip overview, stop details, large outcome actions, POD capture, and completion states. — evidence: `driver.test.tsx`, `driver.spec.ts`, Chromium journey at 402/834 px

#### Database

- [x] Add delivery records, POD metadata, and object-store configuration. (`V20261003_2300`, `CLOUDINARY_URL`)

#### Python / Intelligence

Not required in this phase.

#### Testing

- [x] Test assignment ownership, state transitions, upload type/size, stop outcomes, and full online trip E2E on phone width.

#### Documentation

- [x] Describe field action sequence and POD retention. ([DELIVERY_VERIFICATION.md](./DELIVERY_VERIFICATION.md), [ADR 0001](./adr/0001-proof-of-delivery-storage.md))

### Parallel Work

Delivery API/state machine, POD storage, and phone UI can advance in parallel after stop contract settles. Merge on one complete stop journey.

### Exit Gate

- [x] Driver completes an assigned trip online.
- [x] Proof and outcome are persisted with actor/time.
- [x] Another driver cannot access the trip.

### Result

After this phase, the system can execute and evidence a published delivery route.

## Phase 14 — Offline & Sync

### Goal

Complete offline & sync as a tested feature slice.

### Why This Phase Comes Now

Field work must survive lost connectivity and replay without duplicate events.

### Dependencies

- Phase 13; idempotent write contract established with driver commands.

### Main Work

#### Backend

- [ ] Implement idempotent `/sync`, per-action transactions, duplicate/conflict results, and stale-plan reconciliation.
- [ ] Preserve occurred-at and recorded-at timestamps.

#### Frontend

- [ ] Precache PWA shell and trip; persist commands/photos in Dexie before acknowledging success.
- [ ] Put the outbox, sync engine and conflict policy in `packages/field-core` behind a storage port, so Phase 14A reuses them.
- [ ] Show pending count, retry, reconciling, conflict, and route-updated states.

#### Database

- [ ] Add sync command idempotency table and retention policy.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [ ] Test offline reload, two stops recorded offline, reconnect, lost response/retry, duplicate replay, expired session, and stale version.

#### Documentation

- [ ] Document conflict policy and queue recovery.

### Parallel Work

Sync endpoint, IndexedDB outbox, and conflict UI can advance together on one command schema. Full airplane-mode journey is the synchronization gate.

### Exit Gate

- [ ] Offline actions survive reload and sync exactly once.
- [ ] Conflicts are visible without losing the field record.
- [ ] Completed stops stand across plan versions.

### Result

After this phase, the system can complete a route during coverage loss and reconcile it safely.

## Phase 14A — Driver Android App (React Native)

**Round 2 scope:** optional native addition under booklet p.12. Preserve this product roadmap; the responsive web/offline driver gates must pass independently.

### Goal

Ship the driver experience as an installable Android APK alongside the PWA, reusing the shared field core.

### Why This Phase Comes Now

The PWA (Phase 13) and the sync protocol (Phase 14) must be proven first; the app then reuses them rather than reinventing them.

### Dependencies

- Phases 13–14; `packages/field-core` extracted with a storage port.

### Main Work

#### Mobile

- [ ] Expo app in `apps/mobile`; screens mirror the PWA driver flow (trip list, stop, arrive, deliver, issue, POD, offline state).
- [ ] `SqliteOutboxStore` (expo-sqlite) implementing the field-core storage port.
- [ ] Bearer-token login stored in `expo-secure-store` (AD-14); POD photos via `expo-image-picker` + `expo-image-manipulator`.
- [ ] Design tokens from `packages/design-tokens` (TS constants).

#### Backend

- [ ] Accept `Authorization: Bearer` sessions for the driver role; same session store and revocation as web.

#### Testing

- [ ] Field-core contract tests run against both Dexie and SQLite stores.
- [ ] Airplane-mode journey on a real Android device: record stops offline, reconnect, each lands exactly once.
- [ ] Token revocation logs the app out.

#### Documentation

- [ ] How to build the APK (EAS) and install it on a device.

### Exit Gate

- [ ] The same driver journey passes on the PWA and on the APK.
- [ ] The APK installs on a real Android phone and syncs offline work exactly once.

### Result

After this phase, drivers can use either the browser or an installed Android app with identical behavior.

## Phase 15 — Receipt Confirmation

### Goal

Complete receipt confirmation as a tested feature slice.

### Why This Phase Comes Now

The store must verify what actually arrived and report discrepancies.

### Dependencies

- Phases 13–14.

### Main Work

#### Backend

- [ ] Expose delivered lines and receipt confirmation; route discrepancy to exceptions and update final order status.

#### Frontend

- [ ] Build receipt view, received/short/damaged actions, issue thread, and status timeline.

#### Database

- [ ] Add receipt and discrepancy records with actor/time.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [ ] Test line ownership, double confirmation, discrepancy event, and order→plan→load→deliver→receipt E2E.

#### Documentation

- [ ] Document receipt resolution and final status semantics.

### Parallel Work

Receipt backend and store UI can proceed on a delivered-stop read contract; full four-role journey is the join point.

### Exit Gate

- [ ] Store manager confirms or disputes delivered items.
- [ ] Dispatcher sees discrepancies.
- [ ] Four-role lifecycle passes end to end.

### Result

After this phase, the system can close the operational delivery loop.

## Phase 16 — Live Operations

### Goal

Complete live operations as a tested feature slice.

### Why This Phase Comes Now

Dispatchers need current route progress and exceptions after departure.

### Dependencies

- Phases 12–15.

### Main Work

#### Backend

- [ ] Build live read model, after-commit event publication, depot-scoped SSE, and polling fallback.

#### Frontend

- [ ] Build active-trip board with current stop, remaining stops, status, last update, and alerts.

#### Database

- [ ] Add indexes/materialized read data only if measured query load requires them.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [ ] Test SSE scope, event-after-commit, reconnect/refetch, polling fallback, and driver update visibility.

#### Documentation

- [ ] Document event types and fallback behavior.

### Parallel Work

Read model and Figma live board can be developed in parallel; SSE wiring follows once event payloads settle.

### Exit Gate

- [ ] Driver action appears on dispatcher board promptly.
- [ ] SSE failure falls back to polling.
- [ ] Status and last-update are correct.

### Result

After this phase, the system can monitor active delivery operations.

## Phase 17 — Forecasting Foundation

**Round 2 scope:** Datathon by default. Review actual submitted-design commitments before deciding whether a sourced future-demand view is part of the Hackathon release; no general trained-model prerequisite exists.

### Goal

Complete forecasting foundation as a tested feature slice.

### Why This Phase Comes Now

Future capacity decisions need measured demand estimates, starting from an honest baseline.

### Dependencies

- Phases 3–4; can start after stable history schema.

### Main Work

#### Backend

- [ ] Persist forecast values/version and expose weekly/daily projection APIs.
- [ ] Schedule batch import/inference; do not call Python on every page load.

#### Frontend

- [ ] Build Figma forecast chart with observed versus predicted values and limitations.

#### Database

- [ ] Add demand forecast and model version metadata.

#### Python / Intelligence

- [ ] Prepare all requested historical demand including deferred/not-run; time-based split.
- [ ] Train seasonal-naive baseline; evaluate any advanced candidate before promotion.

#### Testing

- [ ] Test ISO week grouping, Fresh-only chilled target, no future leakage, holdout metric, and weekly→daily operating-day conversion.

#### Documentation

- [ ] Record source windows, baseline, metric, horizon, and uncertainty policy.

### Parallel Work

Historical feature pipeline, persistence/API, and chart shell can progress in parallel after the forecast contract is fixed. Model promotion waits for holdout evaluation.

### Exit Gate

- [ ] Forecast source and version are visible.
- [ ] Baseline and candidate are evaluated on time holdout.
- [ ] Forecast limitations are shown.

### Result

After this phase, the system can view a reproducible depot/brand demand outlook.

## Phase 18 — Service-Time & Late-Risk ML

**Round 2 scope:** separate Datathon prediction work (booklet p.15). Deterministic operational ETA and service allowances remain available without learned predictions.

### Goal

Complete service-time & late-risk ml as a tested feature slice.

### Why This Phase Comes Now

Learned predictions are useful only when they improve ETA or risk decisions over simple baselines.

### Dependencies

- Phases 13 and 17 for production integration; research may start when data is available.

### Main Work

#### Backend

- [ ] Persist prediction outputs and version; use deterministic service allowances when model unavailable.
- [ ] Never use predictions to relax hard planning budgets.

#### Frontend

- [ ] Show ETA/risk with source, uncertainty, and no stale model value.

#### Database

- [ ] Add prediction metadata and artifact reference; keep binary artifacts outside PostgreSQL.

#### Python / Intelligence

- [ ] Derive service/late labels from route records; build prediction-time-safe features.
- [ ] Train regression/classification baselines and candidates with time split; calibrate risk probabilities.

#### Testing

- [ ] Test label derivation, absence of `actual_*` leakage, MAE/calibration versus baseline, artifact version, and outage fallback.

#### Documentation

- [ ] For each model record decision improved, target, features, metric, promotion threshold, and failure behavior.

### Parallel Work

Feature engineering/evaluation and prediction display can advance independently on a sample contract; production activation waits for measured benefit.

### Exit Gate

- [ ] Every adopted model beats or usefully complements baseline on held-out data.
- [ ] No leaked actual-time feature enters inference.
- [ ] Hard constraints remain deterministic.

### Result

After this phase, the system can provide evidence-backed ETA and lateness estimates.

## Phase 19 — Capacity Decision Support

**Round 2 scope:** conditional on the actual submitted Designathon. Keep this full product phase on the roadmap; an unresolved promised flow must be implemented honestly or recorded as a significant departure, not silently treated as completed.

### Goal

Complete capacity decision support as a tested feature slice.

### Why This Phase Comes Now

Forecasts matter when they inform a recorded fleet decision.

### Dependencies

- Phases 3 and 17; Phase 18 inputs are optional and must stay advisory.

### Main Work

#### Backend

- [ ] Compute available total/chilled capacity with trip, time, access, and fuel limits; compare forecast intervals.
- [ ] Record dispatcher decision and rationale without auto-changing fleet state.

#### Frontend

- [ ] Build Figma Capacity Decision from computed figures with range, gap, risk weeks, and options.

#### Database

- [ ] Add capacity decision record and indexes for forecast/fleet joins.

#### Python / Intelligence

- [ ] Provide forecast intervals; service-time predictions may inform display but not hard capacity rules.

#### Testing

- [ ] Reconcile capacity to seeded fleet; test chilled/van-only bounds, lower/upper interval severity, and recommendations that do not close a gap.

#### Documentation

- [ ] Document assumptions, uncertainty, and human decision ownership.

### Parallel Work

Fleet calculator, forecast UI, and interval analysis can proceed in parallel once units/horizon are fixed. Review every displayed number against the source data.

### Exit Gate

- [ ] No illustrative placeholder remains.
- [ ] Gaps and options trace to computed inputs.
- [ ] Dispatcher can record a decision.

### Result

After this phase, the system can make a transparent future-capacity decision.

## Phase 20 — Advanced Decision Support

**Round 2 scope:** optional enhancement except for confirmed submitted-design commitments. Core four-role, offline and engineering gates take priority without a deadline-based quality waiver.

### Goal

Complete advanced decision support as a tested feature slice.

### Why This Phase Comes Now

Additional views should solve observed planning or operational problems after the core works.

### Dependencies

- Phases 9–19 as relevant; each candidate has its own dependency.

### Main Work

#### Backend

- [ ] Choose only features with measurable value: scenario simulation, plan comparison, reefer bottleneck detail, risk list, or capacity recommendation.

#### Frontend

- [ ] Build selected interactions against existing components and real API outputs.

#### Database

- [ ] Persist scenarios separately from the active plan; record decision history where needed.

#### Python / Intelligence

- [ ] Reuse validated solver/model artifacts only where the candidate needs them.

#### Testing

- [ ] For each candidate, define a measurable outcome, baseline, integration test, and no-active-plan-mutation check.

#### Documentation

- [ ] Record problem, value, dependencies, and measured result for each selected feature.

### Parallel Work

Different candidates may run in parallel if they touch independent modules. Share only stable simulation and metric contracts; avoid simultaneous edits to planning core.

### Exit Gate

- [ ] Selected features show measured value.
- [ ] Scenarios never mutate active plans implicitly.
- [ ] Each feature meets the common definition of done.

### Result

After this phase, the system can compare and explain advanced operational choices.

## Phase 21 — System Hardening

### Goal

Complete system hardening as a tested feature slice.

### Why This Phase Comes Now

Cross-cutting failures emerge after feature integration and must be resolved deliberately.

### Dependencies

- All functional slices in the chosen release scope. For Round 2, required foundation/manual/deferral, operational handoff, field/offline/receipt and visibility slices must pass; optional Phases 9, 14A and 17–20 are dependencies only if shipped or required by the submitted design.

### Main Work

#### Backend

- [ ] Review auth/data scope, transaction boundaries, optimistic locking, structured logging, health, recovery, and backups.

#### Frontend

- [ ] Audit keyboard/screen-reader basics, responsive role views, errors, and browser behavior.

#### Database

- [ ] Review indexes, pagination, migration compatibility, retention, and backup/restore.

#### Python / Intelligence

- [ ] Check timeouts, artifact fallback, and contract observability.

#### Testing

- [ ] Run security, concurrency, performance, rollback, failure injection, accessibility, physical-device, and restore drills.

#### Documentation

- [ ] Update runbooks, architecture decisions, and known limitations.

### Parallel Work

Security, accessibility, database/performance, and recovery reviews can run concurrently. Findings that change shared contracts synchronize through integration tests.

### Exit Gate

- [ ] No critical auth/concurrency defects remain.
- [ ] Backup restore and failure recovery are rehearsed.
- [ ] Mobile, browser, and accessibility checks pass.

### Result

After this phase, the system can operate and recover the system confidently.

## Phase 22 — Full-System Verification

### Goal

Complete full-system verification as a tested feature slice.

### Why This Phase Comes Now

The final gate proves all roles and services work together from a fresh environment.

### Dependencies

- All phases in the chosen release scope; Phase 21 complete.

### Main Work

#### Backend

- [ ] Exercise store, dispatcher, loader, driver, receipt and operations paths with real service boundaries; include future-capacity/model paths only when part of the chosen release or a confirmed submitted-design commitment.

#### Frontend

- [ ] Repeat full judge/operator journey at desktop, tablet, and phone widths.

#### Database

- [ ] Start from empty PostgreSQL volume; verify migration, seed, versioning, backup/restore, and DB restart.

#### Python / Intelligence

- [ ] Test Python unavailable, invalid optimizer output, and model fallback.

#### Testing

- [ ] Run Playwright full journeys and S1; duplicate sync, offline driver, stale plan, invalid publication, concurrent edits, and reconciliation.
- [ ] Compare API/contract build artifacts and run Compose smoke from a clean clone.

#### Documentation

- [ ] Update README, architecture diagrams, data model, account/test setup, and accurate AI-tool disclosure.

### Parallel Work

Workflow, failure, infrastructure, and documentation verification can happen in parallel on the same release candidate. Freeze interface changes and rerun affected journeys after every fix.

### Exit Gate

- [ ] Fresh startup and full workflow pass.
- [ ] All named failure journeys recover correctly.
- [ ] Another developer can follow docs and reproduce results.

### Result

After this phase, the chosen release scope is reproducible end to end. Round 2 closes the operational four-role loop; future-capacity/model paths are included when selected, not assumed implemented.

## 4. Release Evidence and Open Questions

Record evidence here as phases finish. Do not mark a phase complete from a local screenshot alone.

| Phase | Verification evidence | Date / owner |
|---|---|---|
| 0–5 | [Earlier completion evidence](./PHASE0_5_COMPLETION_VERIFICATION.md); [current reconciliation and open UI/CI gates](./ROUND2_REQUIREMENTS_AUDIT.md) | 2026-10-02 / 2026-10-03 |
| 6 | 56 domain tests pass; timing fixtures verified; boundary/input/cross-trip gate open — [audit](./ROUND2_REQUIREMENTS_AUDIT.md) | 2026-10-03 |
| 7 | [Manual planning curl/PostgreSQL/browser evidence](./MANUAL_PLANNING_VERIFICATION.md); integration tests pass in fresh full suite | 2026-10-03 |
| 8 | [Deferral verification](./DEFERRAL_VERIFICATION.md): tests, curl, SQL and browser journey; Figma comparison of two frames pending | 2026-10-03 |
| 11 | [Publication verification](./PUBLICATION_VERIFICATION.md): tests, curl/SQL, Step 5 browser on synthetic data | 2026-10-03 |
| 12 | [Loading verification](./LOADING_VERIFICATION.md): tests, curl/SQL, Playwright and browser on synthetic data | 2026-10-03 |
| 9–10, 13–22 | Pending; optional/conditional phases retain their scope labels | — |

- Earlier Figma/token records say only Dispatcher frames exist; design documentation links Store, Loader and Driver frames in the same file. Current MCP access did not yield metadata. Reconcile the actual submitted frames before declaring design fidelity or inventing missing screens.
- The supplied calendar ends on 2026-06-28. Choose a seeded demo date inside that range or add explicit later calendar records before testing cutoff and operating-day logic.
- Treat S1's ~17.2 m³ refrigerated shortfall as a lower bound. Record a feasible whole-order allocation before claiming an exact optimum.
- The technical reference identifies candidate-version uniqueness and audit transaction issues in the former schema narrative; use its corrected invariants in migrations.
