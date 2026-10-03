# TechTrithalon — Waypoint Operations

Waypoint Operations is a delivery planning and execution system for **Waypoint Group**, a fictional Sri Lankan retail group: 3 brands (Fresh, Style, Tech), 120 outlets, 2 depots (Peliyagoda, Kandy) and 60 vehicles. It connects four roles across one workflow:

```
Store manager      Dispatcher        Loader      Driver       Store manager     Dispatcher
place order  →  close + plan  →     load    →  deliver  →  confirm receipt → plan capacity
```

The fleet usually can't serve every order, so the core of the system is **constraint-checked planning**: assign orders to vehicles and trips, decide which orders to defer, and explain why.

> **Status:** Ordering, complete immutable snapshots, the constraint engine, validated manual planning, durable deferrals with store notices, and operational publication (plan versions, fuel counted once, frozen schedule, driver assignment and load tasks) are implemented. Latest checks: 135 API and 83 web tests, clean lint and typecheck. Hosted CI remains open. The loader and driver screens, offline sync and store receipt are not implemented yet. See the [Round 2 audit and remaining execution steps](docs/ROUND2_REQUIREMENTS_AUDIT.md).

---

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Web client | React 19 · TypeScript · Vite · TanStack Query · React Router | One responsive app for all four roles; dispatcher on desktop, driver/loader on phone |
| API client | `openapi-typescript` + `openapi-fetch`, generated from `apps/api/openapi.json` | Frontend and backend types can't drift apart |
| Driver clients (planned) | PWA (IndexedDB/Dexie) **and** React Native Expo Android APK (SQLite), sharing `packages/field-core` | Drivers keep working without coverage; installable app on personal phones |
| Operational API | Java 21 · Spring Boot 3.5 · Spring Web MVC · JDBC/JPA · Bean Validation | A modular monolith: transactional, validation-heavy domain |
| API docs | springdoc-openapi (OpenAPI 3.1) | Single source for the generated client |
| Database | PostgreSQL 16 · Flyway migrations | The single operational source of truth |
| Intelligence | Python 3.12 · FastAPI · Pydantic (planned: OR-Tools CP-SAT, pandas, scikit-learn) | Optimization, forecasting and prediction only; **no database access** |
| Testing | JUnit 5 · Testcontainers · MockMvc · pytest · Vitest | Integration tests run against real PostgreSQL |
| Runtime | Docker · Docker Compose · GitHub Actions | One command to start the full stack |

---

## Architecture

```
          React + TypeScript (web, PWA)
                      │  REST /api/v1  (+ SSE for live updates, planned)
                      ▼
      Spring Boot modular monolith (apps/api)
          │                         │  HTTP, stateless
          ▼                         ▼
     PostgreSQL               Python intelligence (apps/intelligence)
  (source of truth)           CP-SAT planner · forecasting · ML
```

Key rules:

- **Spring owns all operational state.** Python receives everything it needs in the request and returns a result. It never writes orders, plans or deliveries.
- **The validator is independent of the planner.** No plan is published unless Spring re-checks every hard constraint.
- **Planning works without Python.** If the intelligence service is down, manual planning and a greedy fallback keep working.
- **Business time is Asia/Colombo.** Code reads time from an injected `Clock`, never directly from `now()`.

---

## Repository structure

```
TechTrithalon/
├── apps/
│   ├── api/                              Spring Boot operational API
│   │   ├── openapi.json                  committed API contract (drift-checked by tests)
│   │   ├── build.gradle.kts
│   │   └── src/
│   │       ├── main/java/lk/techtrithalon/waypoint/
│   │       │   ├── shared/               cross-cutting: error envelope, Clock, request id, CORS, OpenAPI
│   │       │   ├── system/               health endpoint
│   │       │   ├── reference/            outlets, vehicles, calendar, travel, allowances + CSV seeder
│   │       │   ├── identity/             users, roles, auth                    ┐
│   │       │   ├── ordering/             order lifecycle, 16:00 cutoff         │
│   │       │   ├── fleetops/             vehicle availability, fuel ledger     │
│   │       │   ├── planning/             snapshots, constraint engine,         │ each module:
│   │       │   │                         validator, plans, deferrals           │   api/
│   │       │   ├── loading/              load tasks, shortfalls                │   application/
│   │       │   ├── delivery/             stop execution, proof of delivery     │   domain/
│   │       │   ├── receipt/              store receipt confirmation            │   infrastructure/
│   │       │   ├── exceptions/           operational exception queue           │
│   │       │   ├── forecast/             demand forecasts, capacity decisions  │
│   │       │   ├── intelligence/         client for the Python service         │
│   │       │   ├── sync/                 offline command ingestion             │
│   │       │   ├── notification/         in-app notifications                  │
│   │       │   └── audit/                append-only decision history          ┘
│   │       ├── main/resources/
│   │       │   ├── application.yml
│   │       │   └── db/migration/         Flyway SQL migrations
│   │       └── test/                     unit, contract and Testcontainers tests
│   │           └── resources/reference-fixture*/   small synthetic CSVs for CI
│   │
│   ├── web/                              React client
│   │   └── src/
│   │       ├── app/                      router, providers, role shells
│   │       ├── features/                 auth · shell · ordering · planning · loading ·
│   │       │                             delivery · receipt · live-ops · fleet · forecast · offline
│   │       ├── components/               design-system components (from Figma)
│   │       ├── generated/                generated API types — do not edit by hand
│   │       ├── lib/                      API client, query setup, offline helpers
│   │       └── styles/
│   │
│   ├── mobile/                           React Native (Expo) driver app → Android APK (Phase 14A)
│   │
│   └── intelligence/                     Python computation service
│       ├── techtrithalon_intelligence/
│       │   ├── app.py                    FastAPI app
│       │   ├── contracts.py              Pydantic request/response models
│       │   ├── planning/                 CP-SAT optimization
│       │   ├── forecasting/              demand forecasting
│       │   ├── prediction/               service-time and late-risk models
│       │   └── features/                 shared feature engineering
│       ├── models/                       versioned model artifacts
│       ├── notebooks/                    exploration only
│       └── tests/
│
├── packages/
│   ├── api-client/                       generated OpenAPI client, shared by web and mobile
│   ├── field-core/                       offline outbox + sync engine, shared by driver PWA and APK
│   └── design-tokens/                    Figma tokens → CSS variables (web) / TS constants (mobile)
├── infrastructure/
│   ├── docker/                           Dockerfiles (api, web, intelligence) + nginx.conf
│   └── compose/                          environment-specific compose overrides
├── docs/
│   ├── IMPLEMENTATION_PLAN.md            phase-by-phase build checklist
│   ├── TECHNICAL_REFERENCE.md            architecture, domain rules, data model
│   ├── architecture/  adr/               diagrams and decision records
│   └── diagrams/                         Designathon diagrams
├── dataset/                              competition data — local only, git-ignored (see below)
├── docker-compose.yml
├── .env.example
└── Makefile
```

---

## Getting started

### Prerequisites

- Docker Desktop (Engine 29 or newer works)
- For local development without containers: JDK 21, Node 20 with Corepack (pnpm 10), Python 3.12+

### 1. Add the dataset (required, never committed)

The competition terms forbid uploading the datasets, and this repository is public, so `dataset/` is git-ignored. Place the supplied files locally:

```
dataset/data/General Data/outlets.csv
dataset/data/General Data/vehicles.csv
dataset/data/General Data/calendar.csv
dataset/data/General Data/district_travel.csv
dataset/data/General Data/service_allowance.csv
```

The API imports these five files on startup. The import is **idempotent**: re-running it creates no duplicates. It is also **atomic**: it checks the row counts (120 outlets, 60 vehicles, 910 calendar days, 12 districts, 9 allowances) and rolls back completely if they don't match. Training and test files are never loaded into the operational database.

Phase 3A also mounts local peak-day files (never committed) from `dataset/data/Test Data/`:

```
dataset/data/Test Data/task2b_peak_day_scenarios.csv
dataset/data/Test Data/task2b_peak_day_fleet.csv
```

Those seed 85 confirmed Peliyagoda orders and 38 fleet availability rows for `DEMO_OPERATING_DATE`.

### 2. Run the full stack

```bash
cp .env.example .env
# Set all four SEED_*_PASSWORD values (12+ characters) in .env first.
docker compose up --build
```

| Service | URL |
|---|---|
| Web app | http://localhost:5173 |
| API health (app) | http://localhost:8080/api/v1/system/health |
| API health (actuator) | http://localhost:8080/actuator/health |
| Reference data summary | http://localhost:8080/api/v1/reference/summary |
| OpenAPI spec | http://localhost:8080/v3/api-docs |
| Intelligence health | http://localhost:8000/health |
| PostgreSQL | localhost:5432 |

The **demo operating date** is `2026-06-26` (a Friday). The API checks at startup that it is an operating day in the calendar. To change it, set `DEMO_OPERATING_DATE`.

For a local walkthrough after the supplied calendar ends, explicitly set `DEMO_CLOCK_INSTANT=2026-06-25T11:00:00Z` (16:30 Asia/Colombo) and rebuild the API. This fixes the injected business clock for the walkthrough, including sessions and audit timestamps; leave it empty for normal operation. Orders never silently fall back to an old delivery date. With real time and no future calendar records, ordering returns `422 NO_OPERATING_DAY` until the calendar is extended. Do not use a fixed clock for deployment.

Order review sends `expectedDeliveryDate`; crossing cutoff returns `409 DELIVERY_DATE_CHANGED` so the manager can review again. The persisted response supplies the confirmation date. PostgreSQL enforces one active order per outlet/date/temperature even for concurrent requests.

Planning snapshots freeze complete order rows, vehicle capabilities and fuel state, outlet windows/access, travel, service allowances, calendar and rule parameters. Their reference version is content-derived. Selected snapshots compare the same selection; all-order snapshots also detect new confirmed orders. Legacy snapshots remain readable but require regeneration. The additive migration deliberately does not backfill historical inputs or delete duplicate orders: if existing active duplicates are present, resolve them with owner approval before applying the unique index.

> **Port already in use?** If another project holds 8080 (or 5173/5432/8000), change `API_PORT` (and `WEB_PORT`, etc.) in `.env`, and set `VITE_API_BASE_URL` to match, for example `http://localhost:8081`. Then rebuild: `docker compose up --build`.

**Verify the stack:** `make smoke` (or `./scripts/smoke.sh`) checks the web app, Spring, Spring → Python, CORS and the seeded data. **Start from scratch:** `make reset` wipes the database volume and re-seeds.

### Sign in and account configuration

Open `/login` in the web app. The server chooses your workspace from the account's role; changing the URL does not grant access.

| Default user ID | Role | Password configuration |
|---|---|---|
| `DSP-001` | Dispatcher | `SEED_DISPATCHER_PASSWORD` |
| `STM-001` | Store manager | `SEED_STORE_MANAGER_PASSWORD` |
| `LDR-001` | Loader | `SEED_LOADER_PASSWORD` |
| `DRV-001` | Driver | `SEED_DRIVER_PASSWORD` |

Passwords have no fallback. Set unique values of at least 12 characters and at most 72 UTF-8 bytes in the ignored `.env` before first startup. The seed runs after reference import and is idempotent: existing accounts and password hashes are preserved. Changing a seed password later does **not** reset an existing account. Local credentials generated during development remain only in `.env`; never publish them or commit the file. To disable account seeding after provisioning, set `SEED_ACCOUNTS_ENABLED=false`.

`SEED_STORE_MANAGER_OUTLET` selects the manager's outlet (`OUT001` by default; `OUT901` for synthetic CI fixtures). `SEED_LOADER_DEPOT` selects the loader's depot. `SEED_DRIVER_VEHICLE` links the driver account to the vehicle it drives (`VEH036` by default; `VEH901` for synthetic fixtures); published trips on that vehicle are assigned to this driver. The dispatcher initially covers both depots. Usernames can be overridden with the corresponding `SEED_*_USERNAME` variables.

The web uses an opaque `HttpOnly; SameSite=Lax` cookie; PostgreSQL stores only its SHA-256 hash. Sessions expire after 16 hours by default (`SESSION_TTL=PT16H`), and logout revokes them immediately. Unchecked **Remember me** creates a browser-session cookie; checked persists it until server expiry. Neither setting stores credentials in browser storage. Set `COOKIE_SECURE=false` for local HTTP and `true` for HTTPS deployment.

Every state-changing API call, including login, needs `X-Requested-With: Waypoint`. Browser origins must be in `WEB_ORIGINS`. Missing/expired sessions return `401`; a wrong role returns `403`. Later feature services must enforce method and ownership guards, returning `404` for someone else's resource. `CurrentUser` provides the trusted actor ID and outlet/depot scope. Driver assignment checks belong to the future trip service; there are no operational trip/order endpoints in Phase 2. Native bearer transport is deferred to Phase 14A.

Login is throttled independently per username and source address after five failed attempts in 15 minutes; `429` includes `Retry-After`. Buckets are in memory for this single API instance. Password recovery currently directs users to their administrator.

Run `corepack pnpm --dir apps/web test:e2e` against the running stack after `corepack pnpm --dir apps/web exec playwright install chromium`. Local tests read credentials from `.env`. An installed Chrome can be used with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. [Phase 2 verification](docs/PHASE2_VERIFICATION.md) records the endpoint and browser evidence.

### 3. Run without containers

```bash
# Database only
docker compose up postgres

# API (Java 21)
cd apps/api && ./gradlew bootRun

# Intelligence
cd apps/intelligence && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/uvicorn techtrithalon_intelligence.app:app --reload --port 8000

# Web
corepack pnpm install && corepack pnpm --dir apps/web dev
```

---

## Testing

```bash
cd apps/api && ./gradlew test              # unit, contract and Testcontainers (needs Docker)
cd apps/intelligence && .venv/bin/pytest   # Python tests
corepack pnpm --dir apps/web lint && corepack pnpm --dir apps/web typecheck && corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web build         # type-check and build the web app
make smoke                                 # whole-stack smoke test (stack must be running)
```

| Test | What it proves |
|---|---|
| `ReferenceSeedIT` | An empty DB migrates and seeds; seeding twice adds no duplicates; a bad import rolls back completely; a non-operating demo date is rejected |
| `RealDatasetSeedIT` | The real dataset matches the documented invariants (brand split, 16 reefers, 13 van-only outlets, 770 operating days). Runs only when the dataset is present, so CI skips it |
| `OpenApiContractTest` | The committed `openapi.json` matches the running API |
| `ApiExceptionHandlerTest` | Errors use one RFC 7807 shape with a stable `code` and `traceId`, and never leak internals |
| `test_health.py` | The Python contract rejects unknown fields; the service has no database credentials |

**After changing an API endpoint**, regenerate the contract and the client:

```bash
cd apps/api && ./gradlew test --tests '*OpenApiContractTest' -PupdateOpenApi
corepack pnpm --dir apps/web generate:api   # or: make gen-api
```

CI fails if `apps/api/openapi.json` or `apps/web/src/generated/` is out of date.

---

## Technical details

**API conventions**
- Base path `/api/v1`.
- Errors are RFC 7807 problem details, extended with `code` (a stable machine-readable string), `traceId` and, for validation failures, `violations`.
- Every response carries an `X-Request-Id` header. The same id appears in the logs.

**Database**
- Schema changes go through Flyway only. Name migrations with a timestamp (`V20261001_0001__description.sql`) so parallel branches don't collide.
- Reference tables use the dataset's natural keys (`OUT001`, `VEH001`).
- The outlet mall window is stored as two `time` columns. The seeder rejects any outlet whose mall window and own window don't overlap.

**Domain constraints** (enforced by the planned constraint engine; full detail in the [technical reference](docs/TECHNICAL_REFERENCE.md))
- A trip carries one brand and one district only.
- Chilled orders need a reefer vehicle, and van-only outlets need a van.
- A vehicle serves only its own depot.
- Orders are never split.
- Each trip must respect both the weight and the volume limit.
- A vehicle runs at most 2 trips a day.
- Delivery windows apply, using the intersection with the mall window where there is one.
- Each vehicle has a weekly fuel quota.
- Deliveries run Monday to Saturday only.
- Daily time budgets: 270 minutes for Fresh, 480 minutes for Style and Tech combined.

**Environment variables** — see [`.env.example`](.env.example). The main ones:

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `techtrithalon` / … | Database credentials |
| `REFERENCE_DATA_DIR` | `../../dataset/data/General Data` | Where the seeder reads CSVs |
| `REFERENCE_SEED_ON_STARTUP` | `true` | Import reference data at startup |
| `DEMO_OPERATING_DATE` | `2026-06-26` | Seeded walkthrough day |
| `INTELLIGENCE_BASE_URL` | `http://localhost:8000` | Python service URL |
| `WEB_ORIGINS` | `http://localhost:5173` | Allowed CORS origins |
| `VITE_API_BASE_URL` | `http://localhost:8080` | API origin used by the web build (generated client paths already include `/api/v1`) |
| `APP_TIME_ZONE` | `Asia/Colombo` | Container time zone |

---

## Contributing

- Work in **vertical feature slices** (migration → Spring → generated client → React → tests), one slice per branch, for example `feat/f04-confirmed-orders`.
- A feature is done only when it meets the definition of done in the [implementation plan](docs/IMPLEMENTATION_PLAN.md).
- Never commit `.env` or anything under `dataset/`.

## Documentation

- [Implementation plan](docs/IMPLEMENTATION_PLAN.md) — phase-by-phase checklist, priorities, exit gates
- [Technical reference](docs/TECHNICAL_REFERENCE.md) — architecture, data model, planning engine, offline design
- [Design documentation](docs/waypoint-design-documentation.md) — Designathon submission
- [Round 2 requirements audit](docs/ROUND2_REQUIREMENTS_AUDIT.md) — booklet scoring, verified phase status, current gaps and execution gates

## Reference data foundation (Phase 3)

The scoped reference APIs supply outlet/vehicle selectors, calendar, travel and service allowances. Fleet availability uses versioned, audited writes; missing availability and fuel balances remain explicitly unrecorded. [Phase 3 verification](docs/PHASE3_VERIFICATION.md) documents endpoints, source CSVs, date bounds, tests and curl responses. The supplied calendar ends on 28 June 2026; no automatic extension is performed.
