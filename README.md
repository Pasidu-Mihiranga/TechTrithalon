# TechTrithalon — Waypoint Operations

Waypoint Operations is a delivery planning and execution system for **Waypoint Group**, a fictional Sri Lankan retail group: 3 brands (Fresh, Style, Tech), 120 outlets, 2 depots (Peliyagoda, Kandy) and 60 vehicles. It connects four roles across one workflow:

```
Store manager      Dispatcher        Loader      Driver       Store manager     Dispatcher
place order  →  close + plan  →     load    →  deliver  →  confirm receipt → plan capacity
```

The fleet usually can't serve every order, so the core of the system is **constraint-checked planning**: assign orders to vehicles and trips, decide which orders to defer, and explain why.

> **Status:** Phase 0 (foundation). The module structure is in place; business features are built phase by phase. See the [implementation plan](docs/IMPLEMENTATION_PLAN.md).

---

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Web client | React 19 · TypeScript · Vite · TanStack Query · React Router | One responsive app for all four roles; dispatcher on desktop, driver/loader on phone |
| API client | `openapi-typescript` + `openapi-fetch`, generated from `apps/api/openapi.json` | Frontend and backend types can't drift apart |
| Offline (planned) | PWA + IndexedDB (Dexie) outbox | Drivers keep working without coverage |
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
├── packages/design-tokens/               Figma tokens → CSS variables / TS constants
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

### 2. Run the full stack

```bash
cp .env.example .env
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
corepack pnpm --dir apps/web build         # type-check and build the web app
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
corepack pnpm --dir apps/web generate:api
```

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
| `VITE_API_BASE_URL` | `http://localhost:8080/api/v1` | API URL used by the web build |
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
