# Waypoint Group — Phase 2 (Hackathon) Analysis & Build Specification

**Tech-Triathlon 2026 · Single-document analysis for the Hackathon phase**

| | |
|---|---|
| Written for | The Waypoint build team (developers + the designer who owns the Figma file) |
| Hackathon deadline | **Sunday, 4 October 2026, 23:59 Asia/Colombo** |
| Document generated | 1 October 2026 — **~3 days remaining** |
| Sources | `docs/Challenge Booklet.pdf` (38 pp, read in full) + all 18 dataset files in `dataset/data/` |
| Chosen stack | Next.js (App Router) + PostgreSQL + Prisma |
| Status | **Complete.** All 15 sections written; §12 (Figma design audit) completed after access was granted on file `nfP1ZRvqcF2cJ4cWeZqyvT` |

---

## §0 — Figma access (resolved)

The original file (`3fk8mzlfxN7XIBHD85FTXp`) stayed inaccessible throughout — every call against it returned an edit-access error, and reconnecting the MCP connector to a different Figma account turned out not to be possible from within the session (it's managed via claude.ai account settings, not a chat command). What unblocked things was a second link to the same design, `nfP1ZRvqcF2cJ4cWeZqyvT`, shared to the already-connected account:

```
handle:  Pasidu Mihiranga
email:   ilamperumapm.23@uom.lk
```

Access to that file is confirmed and §12 is now complete, read via `get_metadata` (full node tree) and verified visually with `get_screenshot` on three key screens. **One open question from that read, worth resolving with the design owner:** the accessible file contains only the Dispatcher role's screens — Store Manager, Loader, and Driver exist in it only as named rationale cards, not built frames. §12.1 and §12.6 cover this in detail; it may simply mean those three roles live in a separate Figma file that hasn't been shared yet, in which case send that link and this audit extends to it quickly.

Everything in §1–§11 and §13–§15 is grounded in the booklet and the real dataset and stands independent of the Figma outcome.

---

## §1 — What Phase 2 is actually graded on

The Hackathon brief is explicit that **your Designathon submission is the implementation specification**. Judges assess faithfulness to it. Build what you designed; document any deliberate departure in the README.

| Criterion | Weight | What moves the needle |
|---|---:|---|
| Engineering quality and architecture | **25%** | Clean monorepo, real data model, working `docker compose up`, architecture diagram, typed boundaries, seed script |
| Functional completeness across all four roles | **20%** | A judge must complete order → plan → load → deliver → confirm receipt end-to-end |
| Planning and allocation engine | **20%** | Must respect **every** constraint and explicitly identify deferred orders (see §5 — this is where most teams lose points) |
| Degradation, offline operation, and recovery | **10%** | Driver works offline and reconciles; at least one designed failure screen is live |
| Fidelity to the Day 5 design | **10%** | Screens match the Figma; departures documented |
| Demo video | **10%** | 5–8 min, all four roles, then code + architecture |
| Creativity | **5%** | §11 suggestions target this cheaply |

**Reading of the weights:** architecture + allocation = 45% of the phase. A beautiful UI with a fake allocator scores far worse than a plain UI with a provably correct one. Prioritise accordingly.

### Hard deliverables checklist

- [ ] **Deployed public URL** + credentials for **four seeded accounts**, one per role
- [ ] GitHub monorepo named `TeamName_SolutionName`
- [ ] `README.md` — setup, configuration, seeded account details, **numbered judge walkthrough**, departures from Day 5 design
- [ ] `docker-compose.yml` **and** `.env.example` at repo root; `docker compose up` must start the full stack **including database and seed data**
- [ ] `docs/` at repo root containing **architecture diagram** + **data model**
- [ ] `docs/` also containing the **AI tool disclosure**
- [ ] Unlisted YouTube demo, **5–8 minutes**, all four roles then code/architecture walkthrough
- [ ] Responsive web app; **driver and loader will be judged on phone-sized screens**
- [ ] Seeded with the shared datasets **and at least one realistic delivery day**, working on a fresh install

> Note the two deliverables that are easiest to forget and are pure free marks: `.env.example` at the **root**, and the AI disclosure living in `docs/` rather than the README.

---

## §2 — Dataset ground truth

These are measured from the files in `dataset/data/`, not from the prose. Seed and validate against these exact numbers.

### Outlets — `General Data/outlets.csv` (120 rows)

| Brand | Peliyagoda | Kandy | Total |
|---|---:|---:|---:|
| Fresh | 49 | 31 | 80 |
| Style | 16 | 9 | 25 |
| Tech | 10 | 5 | 15 |

**District → depot is a fixed 1:1 mapping** (12 districts, no district is shared between depots). This is a useful invariant — depot can be derived from district, and `vehicle.depot == outlet.depot` reduces to a district check.

- Peliyagoda: Colombo (24), Gampaha (15), Kalutara (10), Galle (9), Kurunegala (8), Matara (6), Puttalam (3)
- Kandy: Kandy (20), Matale (8), Badulla (6), Nuwara Eliya (6), Kegalle (5)

**Access attributes:**
- `dock_type` — `rear_dock` 68, `street` 40, `mall_bay` 12
- `parking_constraint` — `normal` 95, `van_only` **13**, `mall_dock` 12
- 12 outlets carry a `mall_window`, one of `09:00-11:00`, `10:00-12:00`, `10:30-12:30`

**Delivery windows, observed:**
- Fresh: `03:00-08:00`, `04:00-07:45`, `05:00-07:30`, `05:30-08:00` — all close **at or before 08:00**
- Style / Tech: `09:00-17:00` for non-mall outlets; mall outlets carry the narrow mall windows above

> The `mall_window` and the `window_open/close_time` are **two separate constraints**. For a mall outlet the effective window is the intersection. Your validator must compute that intersection rather than picking one.

### Vehicles — `General Data/vehicles.csv` (60 rows)

| Type | Temp | Peliyagoda | Kandy | Total |
|---|---|---:|---:|---:|
| truck | ambient | 27 | 13 | 40 |
| truck | reefer | 7 | 5 | 12 |
| van | ambient | 2 | 2 | 4 |
| van | reefer | 2 | 2 | 4 |

Totals: **16 reefer** (12 trucks + 4 vans), **8 vans** (4 of them reefer). Matches the booklet exactly.

- Trucks: weight 3,610–7,200 kg · volume 19.4–38.0 m³
- Vans: weight 1,040–1,200 kg · volume 7.0–9.0 m³
- `weekly_fuel_quota_l` 340–620 L · `km_per_l` varies · all `diesel`

> **The van squeeze is structural and deliberate.** 13 outlets are `van_only` and only 8 vans exist across both depots, 4 of them reefer. A Fresh `van_only` outlet needing chilled goods can *only* be served by one of the 4 reefer vans — 2 per depot. Surface this in the UI; it is the single most common source of infeasibility.

### Service allowances — `General Data/service_allowance.csv`

Handling minutes per stop, by brand × dock type. A planning allowance, **not** an observed duration.

| Brand | rear_dock | street | mall_bay |
|---|---:|---:|---:|
| Fresh | 15 | 16 | 18 |
| Style | 38 | 46 | **59** |
| Tech | 43 | 55 | 55 |

> Style and Tech handling is **3–4× Fresh**. A 2-stop Style mall trip burns 118 handling minutes before any travel. This is why Style/Tech get a 480-minute budget and Fresh gets 270.

### District travel — `General Data/district_travel.csv`

| District | Depot | Road class | Depot→district (min) | Inter-stop (min) |
|---|---|---|---:|---:|
| Colombo | Peliyagoda | urban | 24 | 8 |
| Gampaha | Peliyagoda | suburban | 37 | 9 |
| Kalutara | Peliyagoda | suburban | 64 | 12 |
| Galle | Peliyagoda | highway | 103 | 9 |
| Kurunegala | Peliyagoda | suburban | 127 | 19 |
| Matara | Peliyagoda | highway | 137 | 10 |
| Puttalam | Peliyagoda | suburban | 173 | 24 |
| Kandy | Kandy | urban | 16 | 6 |
| Matale | Kandy | suburban | 35 | 11 |
| Kegalle | Kandy | suburban | 53 | 13 |
| Nuwara Eliya | Kandy | hill | 111 | 20 |
| Badulla | Kandy | hill | 186 | 23 |

> **Badulla is 186 minutes out and the Fresh window closes by 08:00.** Departing at the 03:30 window open, a vehicle reaches Badulla at 06:36 with 84 minutes of the 270-minute budget left. Puttalam (173) is nearly as bad. These long-haul Fresh districts are permanently one-trip-only and are the first places your planner should expect strain.

### Calendar — `General Data/calendar.csv` (910 rows)

- Range **2024-01-01 → 2026-06-28**; 770 operating days
- Non-operating: 130 Sundays + 10 festival/public holidays scattered across weekdays
- Festivals: `thai_pongal`, `new_year`, `vesak`, `poson`, `esala`, `deepavali`, `christmas`
- `festival_ramp` rises 0→1 over the nine days preceding a festival — a ready-made demand feature
- `iso_year` + `iso_week` are the grouping keys the Datathon mandates; store them on the order row

### Training history — `Training Data/` (for context and seeding realism)

- `deliveries_train.csv` — **92,307 orders**; `attempted` 90,351 · `deferred` 1,543 · `not_run` 413
- `route_legs_train.csv` — **91,894 legs**; actual times present only here
- Temperature split: ambient 57,172 · chilled 35,135
- Routes per vehicle-day: **1 → 12,560 · 2 → 6,319 · never 3** — confirms the two-trip ceiling empirically
- Derived baseline: **19.6% of deliveries arrived after window close**
- Derived baseline: service time = `leave_outlet_time − max(arrival_time, window_open_time)` → **mean 19.0 min, median 15, p10 8, p90 32**

> Those last two lines are your Datathon Task 1 sanity checks, and they are also the honest numbers to put on the dispatcher dashboard as "historical on-time rate: 80.4%". Using real derived figures rather than invented ones reads well to judges.

---

## §3 — The seven-stage workflow and the four roles

The booklet defines the chain. Every stage must be reachable by a judge.

| # | Stage | Role | System requirement | Device context |
|---|---|---|---|---|
| 1 | Place order | Store manager | Capture and **confirm** the order before the 16:00 cutoff | Desktop or phone, outlet counter |
| 2 | Close orders | Dispatcher | Bring confirmed orders into one queue at cutoff | Large screen, stable connectivity |
| 3 | Plan and allocate | Dispatcher | Assign served orders to vehicles and trips; **identify deferred orders** | Large screen |
| 4 | Load | Loader | Load to the planned stop sequence; **flag shortfalls** | Shared tablet/terminal at dock |
| 5 | Deliver | Driver | Follow route, record each stop, **including offline** | Personal phone, on the road |
| 6 | Confirm receipt | Store manager | Confirm what arrived, report issues | Desktop or phone |
| 7 | Plan future capacity | Dispatcher | Use demand forecasts for vehicles, drivers, reefer capacity | Large screen |

### Role pressure points the booklet calls out explicitly

**Dispatcher** — needs visibility into progress *after* vehicles leave; needs to explain deferral decisions and **identify outlets already skipped**. → The deferral ledger in §11 is a direct response to this sentence.

**Loader** — printed lists go stale when plans change; needs stop sequence so goods load in an order supporting unloading; needs to flag missing/damaged items **before departure**. → Implies plan versioning and a load-vs-plan diff, not just a printout.

**Driver** — personal phone, paper run sheet today; *"design interactions for use when safely stopped"*; needs proof of delivery so disputes don't rest on memory; must record offline and sync later. → Large tap targets, few taps per stop, no typing while moving, photo POD.

**Store manager** — currently orders by phone with no confirmation; needs an **expected arrival time** to roster staff; needs **clear notice when deferred** plus a way to confirm receipt and report issues. → ETA surfacing and deferral notification are requirements, not nice-to-haves.

---

## §4 — Operating constraints as executable rules

These are the rules the allocation engine must enforce. Implement each as a named, individually-testable predicate so you can show the judge *which* rule rejected a given assignment.

| ID | Rule | Source | Implementation note |
|---|---|---|---|
| `R1` | All orders sharing `vehicle_id` + `trip_id` must be the **same brand and district** | Task 2B rule 1 | Makes a trip a single (brand, district) unit — model it as such |
| `R2` | `temp_requirement = chilled` requires `vehicle.temp = reefer`; reefers may also carry ambient | Rule 2 | One-way compatibility, not equality |
| `R3` | `parking_constraint = van_only` requires `vehicle.type = van` | Rule 3 | 13 outlets, 8 vans |
| `R4` | A vehicle serves **only its own depot's** outlets | Rule 4 | Reduces to district check (§2) |
| `R5` | **Whole orders only** — never split an order across trips or vehicles | Rule 5 | Guard this in the data model: an order has at most one trip |
| `R6` | Per trip: `Σ order_volume_m3 ≤ volume_cap_m3` **and** `Σ order_weight_kg ≤ weight_cap_kg` | Rule 6 | Both, independently |
| `R7` | Max **two trips per vehicle per day**, within the time budgets below | Rule 7 | Confirmed by training data |
| `R8` | Delivery window respected; mall outlets within the **mall** window; early arrival **waits** for window open | Operating constraints | Effective window = intersection |
| `R9` | **Weekly** fuel quota per vehicle; route distance consumes it | Operating constraints | Ledger keyed by `vehicle × iso_week` |
| `R10` | Waypoint operates **Monday–Saturday**; use `calendar.is_operating` | Operating constraints | Reject planning on non-operating dates |

### The trip-time formula — implement it exactly

```
trip_minutes = depot_to_district_freeflow_min                    # once per trip
             + inter_stop_freeflow_min × (order_count − 1)       # zero if one order
             + Σ service_allowance_min[brand][outlet.dock_type]  # every stop
```

**Do not add the return journey** — the budgets already allow for it.

Budgets, applied to the **sum** of a vehicle's trips in that category:

| Category | Operating window | Daily budget per vehicle |
|---|---|---:|
| Fresh | 03:30 – 08:00 | **270 min** |
| Style + Tech combined | Trading day | **480 min** |

These are separate budgets but share the two-trip ceiling: a vehicle may run one Fresh trip and one Style trip, each checked against its own budget, and no third trip.

**Worked check against the booklet's own example** — Fresh → Gampaha, 3 orders (rear_dock, rear_dock, street):
`37 + 9×(3−1) + 15 + 15 + 16 = 37 + 18 + 46 = 101 min` ✓ matches the booklet's 101.

Second example, Fresh → Colombo, 4 street stops: `24 + 8×3 + 16×4 = 24 + 24 + 64 = 112` ✓. Combined `101 + 112 = 213` of 270 ✓.

Your engine must reproduce both of these. Make them unit tests — they are free, authoritative fixtures.

---

## §5 — The allocation engine, proved against the real peak-day scenario

This is 20% of the phase, and the booklet demands the system *"handle a day when demand exceeds available capacity"*. The supplied `S1` scenario is exactly that day, and analysing it tells you what your engine must be able to explain.

### S1 at a glance — `Test Data/task2b_peak_day_*.csv`

- **85 orders**, all Peliyagoda. Fresh 75 · Style 5 · Tech 5
- Fleet: **28 available, 10 `in_workshop`** (workshop vehicles are unusable)
- Available mix: 22 ambient trucks · **3 reefer trucks** · 2 ambient vans · **1 reefer van**
- Total demand: **409.9 m³ / 68,139 kg**
- Chilled demand: 26 orders, **181.6 m³ / 32,780 kg**
- 6 `van_only` orders (all Colombo, 3 of them chilled)
- 10 orders were `deferred_yesterday`; 5 outlets are at `days_since_last_served = 5`

### Finding: the fleet looks ample and is actually infeasible

Aggregate capacity is 759.2 m³ per trip against 409.9 m³ of demand — a naive volume check says "comfortable". That is a trap. The constraint binds on **reefer capacity**, and it binds three independent ways.

**Available reefers:**

| Vehicle | Type | Volume | Weight |
|---|---|---:|---:|
| VEH003 | truck | 26.4 m³ | 5,510 kg |
| VEH006 | truck | 33.4 m³ | 6,840 kg |
| VEH007 | truck | 19.4 m³ | 3,610 kg |
| VEH036 | **van** | 7.0 m³ | 1,040 kg |
| | | **86.2 m³** | **17,000 kg** |

**Bind 1 — reefer volume.** Two trips each gives `86.2 × 2 = 172.4 m³` against 181.6 m³ of chilled demand. **Shortfall 9.2 m³.** Chilled weight is fine (32,780 vs 34,000 kg), so volume is the cut.

**Bind 2 — the reefer van is captive.** The 3 chilled `van_only` orders total 6.01 m³ / **1,095.7 kg**, and VEH036 — the only available reefer van — caps at 1,040 kg. They **cannot fit in one trip**; VEH036 must spend both its trips on them. That removes it from the general chilled pool, leaving the 3 reefer trucks (79.2 m³ × 2 = 158.4 m³) to cover the remaining 175.6 m³. **Real shortfall: 17.2 m³**, nearly double the naive figure.

**Bind 3 — reefer trip count and time.** Chilled orders span 7 districts, and because `R1` locks a trip to one district, each needs its own trip. Colombo chilled is 51.59 m³ and Gampaha 48.06 m³ — both exceed any single reefer, so each needs two trips. Minimum trips = `2 + 2 + 1 + 1 + 1 + 1 + 1 = 9`, against `4 reefers × 2 = 8` available. Separately, one trip per district costs `228+173+210+188+177+143+134 = 1,253` minutes against a `4 × 270 = 1,080`-minute reefer budget. **Infeasible on trip count and on time, not only volume.**

**Meanwhile ambient has enormous slack.** 22 ambient trucks give 5,940 Fresh minutes; covering all 49 Fresh ambient orders at one trip per district costs ~1,871. Ambient demand is comfortably servable.

### The conclusion your engine and your policy must reach

> **Every unavoidable deferral on S1 is a chilled Fresh order.** No ambient order needs to be deferred. The limiting resource is refrigerated volume — compounded by 10 vehicles in the workshop, of which the reefers hurt disproportionately — and the discretionary choice is *which* chilled outlets absorb roughly 17 m³ of deferral.

This is the explanation a judge is looking for, and it is exactly the shape of reasoning the Task 2B written policy asks for. Build the engine so the UI can state it.

### Recommended engine design

A greedy-with-explanations allocator, not an optimiser. It is defensible, fast to build, and fully explainable — which is what is graded.

1. **Group** orders into candidate trips by `(brand, district, temp_requirement)` — `R1` makes this natural.
2. **Rank** candidate orders by a transparent priority score (see below).
3. **Match** each group to the cheapest *feasible* vehicle, checking `R2`,`R3`,`R4` as a filter and `R6`,`R7`,`R9` as accumulators. Serve the scarcest resource first: **`van_only` + chilled orders before anything else**, because they have exactly one eligible vehicle class.
4. **Bin-pack** within a group by descending volume, opening a second trip when `R6` or the time budget is hit.
5. **Defer** what does not fit, and **record the binding rule by name** on each deferred order.
6. **Re-validate** the whole plan against all ten rules before publishing, so the plan can never be published infeasible.

**Priority score** — use the fields the dataset already gives you:

```
priority = 3·deferred_yesterday
         + 2·min(days_since_last_served, 5) / 5
         + 1·(brand == 'Fresh')          # window closes 08:00, no second chance that day
         + 1·(temp_requirement == 'chilled')  # spoilage risk
```

Both `deferred_yesterday` and `days_since_last_served` ship in the scenario file precisely so you can avoid starving the same outlet twice — and the booklet names that failure directly: *"Decisions made under pressure can leave the same outlet unserved on consecutive runs."* Using these two columns closes that loop and is cheap to implement.

> **Order of implementation matters.** Build the **validator first**, then the allocator. A correct validator plus manual assignment already satisfies the brief ("manual decisions with validation" is explicitly allowed) and guarantees you ship something scoreable. The automatic allocator then becomes an enhancement on a working base rather than a single point of failure.

---

## §6 — Recommended architecture

Next.js + PostgreSQL + Prisma, as chosen. One deployable, one database, one language — the right trade-off with three days left.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Browsers                                                             │
│  Dispatcher (desktop)   Loader (tablet)   Driver (phone)   Store mgr │
│         │                    │                 │               │     │
│         │                    │        Service Worker +         │     │
│         │                    │        IndexedDB outbox         │     │
└─────────┼────────────────────┼─────────────────┼───────────────┼─────┘
          └────────────────────┴────────┬────────┴───────────────┘
                                        │ HTTPS
┌───────────────────────────────────────▼──────────────────────────────┐
│ Next.js (App Router) — single container                              │
│                                                                      │
│  app/(dispatcher) (loader) (driver) (store)   ← route groups by role │
│  middleware.ts                                ← session + RBAC guard │
│                                                                      │
│  Server Actions / Route Handlers             ← the only write path   │
│   ├── POST /api/sync        idempotent batch replay from the outbox  │
│   └── GET  /api/plan/:date/stream   SSE live progress                │
│                                                                      │
│  lib/engine/   ← PURE, NO I/O, UNIT-TESTED                           │
│   ├── rules.ts        R1..R10, one named predicate each              │
│   ├── tripTime.ts     the §4 formula (booklet fixtures as tests)     │
│   ├── allocate.ts     greedy allocator + reasons                     │
│   └── validate.ts     whole-plan feasibility report                  │
│                                                                      │
│  lib/db.ts  → Prisma Client                                          │
└───────────────────────────────────────┬──────────────────────────────┘
                                        │
┌───────────────────────────────────────▼──────────────────────────────┐
│ PostgreSQL 16 — container, volume-backed                             │
│  reference: outlets, vehicles, calendar, district_travel,            │
│             service_allowance                                        │
│  operational: orders, plans, trips, stops, events, deferrals,        │
│             fuel_ledger, sync_log                                    │
└──────────────────────────────────────────────────────────────────────┘
```

**The one architectural decision that matters most:** `lib/engine/` is **pure TypeScript with zero database access**. Rules take plain objects and return verdicts. This gives you fast unit tests against the booklet's own worked examples, lets you run the same engine in a seed script and in a CI check, and gives the judge something concrete to look at during the architecture portion of the demo video. It is also what distinguishes "engineering quality" from "it works".

### Repository layout

```
TeamName_SolutionName/
├── docker-compose.yml          # REQUIRED at root — app + postgres + seed
├── .env.example                # REQUIRED at root
├── README.md                   # setup, creds, numbered judge walkthrough, departures
├── docs/
│   ├── architecture.md + architecture.png   # REQUIRED
│   ├── data-model.md + erd.png              # REQUIRED
│   └── ai-tool-disclosure.md                # REQUIRED
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                 # loads the CSVs + builds one realistic delivery day
├── data/                       # the shared CSVs, committed
├── src/
│   ├── app/                    # route groups per role
│   ├── lib/engine/             # pure rules + allocator
│   └── components/
└── tests/engine.test.ts        # booklet fixtures: 101 min, 112 min, 213/270
```

### `docker compose up` must do everything

The brief is unambiguous: the single command starts the complete stack **including database and seed data**. Make the app container's entrypoint run `prisma migrate deploy && prisma db seed` before `next start`, with the seed idempotent so a restart doesn't duplicate. Test this **from a fresh clone on a machine with no volumes** before you submit — a seed that only works on your laptop is a common and expensive failure.

### Technology choices

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript | One deployable; route groups map cleanly to the four roles |
| DB / ORM | PostgreSQL 16 + Prisma | Migrations and seeding are first-class; the ERD generates from the schema |
| UI | Tailwind + shadcn/ui | Fast, consistent, accessible defaults; dense dispatcher tables and large driver tap targets from one system |
| Auth | Auth.js credentials provider, or a signed-cookie session | Four seeded accounts is the requirement — do **not** burn hours on OAuth |
| Offline | Service worker (`next-pwa` or hand-rolled) + IndexedDB (`idb` or Dexie) | §9 |
| Live progress | **SSE**, not WebSockets | One-directional, survives serverless, far less to go wrong |
| Validation | Zod, shared client and server | One schema for form + API + engine input |
| Tests | Vitest on `lib/engine/` only | Highest value per minute; skip UI tests at this deadline |
| Deploy | Fly.io or Railway (app + managed Postgres) | Keep it live through semifinal and Grand Finale as required |
| Diagrams | Mermaid in markdown, exported to PNG | Both diagram deliverables from source you can edit |

> **Deploy on day 1, not day 3.** Push a hello-world through the full pipeline today. Deployment problems discovered on the final evening are the classic way to lose a 20%-weighted "functional completeness" score on work that was actually finished.

---

## §7 — Data model

Prisma schema. Reference tables mirror the CSVs exactly so seeding is a straight load and the judge can trace any number back to the supplied data.

```prisma
// ── Reference data: loaded verbatim from dataset/data/General Data/ ──

model Outlet {
  id                String   @id            // OUT001..OUT120
  brand             Brand
  district          String
  depot             Depot
  dockType          DockType
  parkingConstraint ParkingConstraint
  mallWindow        String?                 // "09:00-11:00", null outside malls
  windowOpen        String                  // "HH:MM" — kept as supplied
  windowClose       String
  orders            Order[]
  @@index([depot, district, brand])
}

model Vehicle {
  id             String   @id               // VEH001..VEH060
  type           VehicleType                // truck | van
  temp           TempCapability             // reefer | ambient
  weightCapKg    Decimal
  volumeCapM3    Decimal
  fuelType       String
  kmPerL         Decimal
  weeklyFuelQuotaL Decimal
  depot          Depot
  status         VehicleStatus @default(available)   // available | in_workshop
  trips          Trip[]
  fuelLedger     FuelLedger[]
  @@index([depot, temp, type])
}

model CalendarDay {
  date         DateTime @id @db.Date
  dow          Int
  dowName      String
  isWeekend    Boolean
  isoYear      Int
  isoWeek      Int
  isPayday     Boolean
  festival     String?
  festivalRamp Decimal
  isHoliday    Boolean
  monsoon      Boolean
  isOperating  Boolean
  @@index([isoYear, isoWeek])
}

model DistrictTravel {
  district                 String @id
  depot                    Depot
  roadClass                String
  freeFlowKmh              Decimal
  depotToDistrictKm        Decimal
  depotToDistrictFreeflowMin Int
  interStopKm              Decimal
  interStopFreeflowMin     Int
}

model ServiceAllowance {
  brand              Brand
  dockType           DockType
  serviceAllowanceMin Int
  @@id([brand, dockType])
}

// ── Operational data ──

model Order {
  id            String   @id @default(cuid())
  ref           String   @unique            // human-readable, shown to store manager
  outletId      String
  outlet        Outlet   @relation(fields: [outletId], references: [id])
  orderDate     DateTime @db.Date           // the date the order is FOR
  placedAt      DateTime @default(now())    // vs the 16:00 cutoff
  brand         Brand
  tempRequirement TempRequirement
  units         Int
  weightKg      Decimal
  volumeM3      Decimal

  status        OrderStatus @default(draft)
  // draft → confirmed → planned → deferred → loaded → in_transit
  //       → delivered | partial | failed → receipt_confirmed

  // R5: whole orders only — at most ONE stop, enforced by the schema itself
  stop          Stop?
  deferrals     Deferral[]

  // denormalised for the priority score, refreshed nightly
  deferredYesterday  Boolean @default(false)
  daysSinceLastServed Int    @default(0)

  @@index([orderDate, status, brand])
  @@index([outletId, orderDate])
}

model Plan {
  id          String   @id @default(cuid())
  planDate    DateTime @db.Date
  depot       Depot
  status      PlanStatus @default(draft)    // draft | published | locked
  version     Int      @default(1)          // ← the loader's stale-list defence
  publishedAt DateTime?
  trips       Trip[]
  @@unique([planDate, depot])
}

model Trip {
  id        String  @id @default(cuid())
  planId    String
  plan      Plan    @relation(fields: [planId], references: [id])
  vehicleId String
  vehicle   Vehicle @relation(fields: [vehicleId], references: [id])
  tripIndex Int                             // 1 or 2 — R7
  brand     Brand                           // R1: a trip is one brand…
  district  String                          // R1: …and one district
  plannedDepart DateTime?
  tripMinutes   Int                         // computed by the §4 formula, stored
  distanceKm    Decimal
  status    TripStatus @default(planned)
  stops     Stop[]
  @@unique([vehicleId, plan Date_placeholder])   // see note below
  @@index([planId, status])
}

model Stop {
  id        String @id @default(cuid())
  tripId    String
  trip      Trip   @relation(fields: [tripId], references: [id])
  orderId   String @unique                  // R5 enforced: one order, one stop
  order     Order  @relation(fields: [orderId], references: [id])
  seq       Int                             // 0-based, matches the dataset
  plannedArrival DateTime
  etaArrival     DateTime?                  // live, recomputed from progress
  actualArrival  DateTime?
  actualDepart   DateTime?
  outcome        StopOutcome?               // delivered | partial | refused | failed
  podPhotoUrl    String?
  receivedBy     String?
  notes          String?
  @@unique([tripId, seq])
}

model Deferral {
  id        String   @id @default(cuid())
  orderId   String
  order     Order    @relation(fields: [orderId], references: [id])
  planDate  DateTime @db.Date
  ruleCode  String                          // "R2" | "R6_volume" | "R7_time" | "discretionary"
  reason    String                          // human sentence shown to the store manager
  bindingResource String?                   // "reefer_volume" | "van_capacity" | …
  decidedBy String
  decidedAt DateTime @default(now())
  @@index([orderId, planDate])
}

model FuelLedger {                          // R9: quota is WEEKLY, not daily
  id        String  @id @default(cuid())
  vehicleId String
  vehicle   Vehicle @relation(fields: [vehicleId], references: [id])
  isoYear   Int
  isoWeek   Int
  litresUsed Decimal @default(0)
  @@unique([vehicleId, isoYear, isoWeek])
}

model Event {                               // append-only audit trail
  id         String   @id @default(cuid())
  type       String                         // order.confirmed, plan.published, stop.delivered…
  actorId    String
  entityType String
  entityId   String
  payload    Json
  occurredAt DateTime                       // when it HAPPENED (may be offline, in the past)
  recordedAt DateTime @default(now())       // when the server received it
  @@index([entityType, entityId, occurredAt])
}

model SyncLog {                             // idempotent offline replay
  idempotencyKey String   @id               // client-generated UUID
  userId         String
  appliedAt      DateTime @default(now())
  resultJson     Json
}
```

**Four schema decisions worth defending in the demo video:**

1. **`Stop.orderId` is `@unique`.** Rule `R5` ("whole orders, never split") is enforced by the database, not by application code that someone might forget to call.
2. **`Plan.version` increments on every republish.** This is the direct answer to the booklet's complaint that *"printed loading lists can become outdated when plans change"* — the loader's device compares its version and shows a diff rather than silently working from stale data.
3. **`Deferral.ruleCode` + `bindingResource`.** Every deferral records *which named rule* forced it. On S1 this means the system itself can report "17.2 m³ of chilled deferred, binding resource: reefer volume" instead of a dispatcher's recollection.
4. **`Event.occurredAt` is separate from `Event.recordedAt`.** An offline driver's delivery happened at 05:42 and arrived at the server at 08:15. Collapsing these two makes the whole offline story unreconcilable. This single field pair is the backbone of §9.

> One cleanup needed: the `Trip` model above shows a placeholder on the `@@unique` for the two-trips-per-vehicle-per-day guard. Because `planDate` lives on `Plan` rather than `Trip`, either denormalise `planDate` onto `Trip` (simplest — then `@@unique([vehicleId, planDate, tripIndex])` works and `R7` is database-enforced) or enforce it in the engine. Denormalising is the better call here.

---

## §8 — User flows

### Store manager — order and receipt (phone/desktop)

```
Login → Dashboard: "Next cutoff 16:00 today · 2h 14m left"
  │
  ├─ Place order ─→ pick products/units ─→ ambient or chilled (Fresh may send BOTH
  │                 for the same delivery day — the booklet says so explicitly)
  │                 → review volume/weight → Confirm
  │                 → CONFIRMATION SCREEN  ← the thing they have never had before
  │
  ├─ My orders ─→ status timeline: confirmed → planned → loaded → in transit → delivered
  │               planned shows an ETA  ← so staff can be rostered (stated need)
  │               deferred shows reason + the new expected date  ← stated need
  │
  └─ Confirm receipt ─→ line-by-line received / short / damaged
                        → raise an issue → resolution thread
```

### Dispatcher — plan and monitor (desktop)

```
Login → Day selector (guard on calendar.is_operating) → Pre-cutoff capacity view
  │       demand accumulating vs available capacity, chilled tracked separately
  │
  ├─ CLOSE ORDERS at 16:00 → single queue of confirmed orders
  │
  ├─ PLAN BOARD
  │   ├─ [Auto-allocate] → engine runs → result split three ways:
  │   │     SERVED  (grouped into trips)
  │   │     DEFERRED – UNAVOIDABLE  (ruleCode shown: "reefer volume, R6")
  │   │     DEFERRED – DISCRETIONARY (your choice, with the priority score shown)
  │   ├─ drag an order between trips → live validation, a violation names its rule
  │   ├─ constraint panel per trip: volume / weight / minutes vs budget / fuel week
  │   └─ "Why this plan" → binding resource + what one more reefer would buy
  │
  ├─ PUBLISH → version increments → loader and driver devices notified
  │
  └─ LIVE BOARD (after vehicles leave)  ← the dispatcher's stated blind spot
      per-trip progress, stop outcomes, late-risk flags, shortfall alerts
```

### Loader — dock (tablet, shared)

```
Login → Today's trips for this depot → select a trip
  │
  ├─ Load list in LOADING order (reverse of stop sequence — last stop loads first,
  │   first stop nearest the door). The booklet asks for a sequence that
  │   "supports unloading"; LIFO is that sequence.
  │
  ├─ tick each line as loaded
  ├─ FLAG SHORTFALL: missing / damaged / wrong quantity
  │     → dispatcher alerted BEFORE departure (explicit requirement)
  │     → dispatcher may re-plan; version bumps; this screen shows the diff
  │
  └─ CONFIRM LOADED → trip releases to the driver
```

### Driver — on the road (phone, intermittent connectivity)

```
Login (token cached for offline) → Today's trip → route downloaded in full
  │
  ├─ Stop list with sequence, ETA, window, dock type, access notes
  │
  ├─ Per stop, designed for "safely stopped": few, large taps
  │   [Arrived] → [Delivered in full] ─────────→ POD: signature or photo
  │             → [Partial / Refused / Failed] → reason chips, not free text
  │   → [Depart] → next stop
  │
  ├─ OFFLINE: everything above works. Writes queue locally.
  │   Persistent banner: "Offline · 4 actions queued"
  │
  └─ Connectivity returns → automatic sync → "4 of 4 synced" (or a conflict screen)
```

### Degradation flows to implement

The booklet requires at least one fully designed failure screen and allocates **10%** to degradation, offline operation and recovery. Pick from these four — they map onto the four roles and onto real dataset conditions:

| # | Scenario | Role | Why it matters to Waypoint |
|---|---|---|---|
| **D1** | **Capacity shortfall at cutoff** — demand exceeds fleet, orders must be deferred with reasons | Dispatcher | The booklet's central business problem; S1 proves it is real and quantifiable |
| **D2** | **Offline driver with queued actions** — plus a sync conflict screen | Driver | Mobile coverage drops across hill country and the Kandy corridor; Badulla and Nuwara Eliya are `hill` road class |
| **D3** | **Stale load list** — plan was republished while the loader was mid-load; show the diff | Loader | The booklet names this exact failure: *"printed loading lists can become outdated when plans change"* |
| **D4** | **Loading shortfall mid-load** — stock is short, trip must be re-planned before departure | Loader → Dispatcher | *"no reliable way to … flag a loading shortfall before departure"* |

**D1 and D2 are the two to build if time is short.** D1 carries the allocation weighting and D2 carries the offline weighting. D3 is nearly free once `Plan.version` exists.

---

## §9 — Offline and recovery strategy

The booklet treats this as a hard requirement, not a flourish: *"Work away from the depot must remain usable offline. Records must reconcile when the connection returns."*

**Scope it deliberately.** Only the **driver** app needs true offline. The dispatcher has stable connectivity by definition, and the loader is on depot wifi. Trying to make all four roles offline-capable in three days is how teams end up with none of them working.

### Mechanism

```
Driver taps [Delivered]
   │
   ▼
1. Write to IndexedDB immediately — the UI updates from local state.
   Record: { idempotencyKey: uuid(), type: 'stop.delivered',
             stopId, occurredAt: <device clock>, payload: {...} }
2. Optimistic UI. No spinner, no network dependency.
3. Background sync drains the outbox in occurredAt order:
      POST /api/sync  { actions: [...] }
4. Server, per action, inside a transaction:
      – has idempotencyKey been seen in SyncLog? → return the stored result, skip
      – otherwise apply, write Event with occurredAt (device) + recordedAt (server)
      – record idempotencyKey in SyncLog
5. Response per action: applied | duplicate | conflict
6. Client clears applied + duplicate, surfaces conflict for resolution.
```

**Why `idempotencyKey` is non-negotiable:** a flaky connection means the *request* succeeds and the *response* is lost. The client retries. Without the key you get double-delivered stops, and your audit trail becomes fiction. This is about fifteen lines of server code and it is the difference between an offline story that survives a judge poking at it and one that does not.

**Conflict policy — state it explicitly in the README:**

| Conflict | Resolution |
|---|---|
| Driver recorded a stop the dispatcher had already cancelled | **Driver's field record wins.** They were physically there. Flag for dispatcher review. |
| Plan republished while driver was offline on an old version | Completed stops stand. Remaining stops adopt the new plan. Show the driver a "route updated" screen. |
| Same stop recorded twice (retry) | Idempotency key dedupes silently. |
| Device clock is skewed | Keep `occurredAt` as recorded but store server `recordedAt`; flag implausible gaps rather than silently rewriting. |

**Caching:** service worker precaches the app shell; the driver's full trip payload (stops, outlets, windows, access notes) is fetched on trip open and held in IndexedDB. **POD photos must be compressed client-side** before queueing — canvas resize to ~1280px, JPEG q0.7, which takes an unbounded photo queue down to roughly 150 KB per stop and keeps the sync feasible on a weak hill-country connection.

---

## §10 — Things the Figma almost certainly does not cover, that development needs

Design files describe screens. These are the system concerns that have no screen but will sink the build or cost judging points if they're discovered late. I'd expect most of these to be absent from the design, and none of them should be treated as scope creep — several are explicit brief requirements.

### Non-negotiable (brief requirements or the build breaks)

1. **Authentication and four seeded accounts.** A deliverable, verbatim. Needs a login screen the Figma may not include. Use credentials auth; do not gold-plate it.
2. **Role-based access control.** Four roles on one app means a middleware guard and role-scoped navigation. A driver must not reach the plan board.
3. **The seed script.** `docker compose up` must produce a working, populated system on a fresh clone, including "at least one realistic delivery day". This is a substantial piece of work — budget real hours, not a rushed final-night script.
4. **Plan versioning and publish lifecycle.** `draft → published → locked`. Without it D3 is unimplementable and the loader's stale-list problem stays unsolved.
5. **Idempotency and the sync endpoint.** §9. No screen, but the offline 10% depends on it.
6. **Weekly fuel ledger.** `R9` is weekly, so it needs state spanning days. Easy to miss entirely because no single screen shows it.
7. **Empty, loading, and error states.** A judge on a fresh install will hit "no orders yet" before anything else. First impressions are made on states designers rarely draw.
8. **The 16:00 cutoff as real logic.** Server-side time check, Asia/Colombo, plus a visible countdown. All booklet times are `Asia/Colombo` — set `TZ` in the container and store `timestamptz`.
9. **Non-operating-day guard.** `calendar.is_operating` is 0 on 130 Sundays and 10 holidays. Planning must refuse those dates.
10. **Health endpoint + readable logs.** For your own deployment debugging on the final day.

### Strongly recommended

11. **Mall window intersection logic.** 12 outlets have both a `mall_window` and a `window_open/close_time`. The effective window is the intersection; nothing in a design file will tell you that.
12. **Audit trail / event log.** The booklet complains that *"handwritten notes provide only a limited record of deliveries and deferral decisions"*. The `Event` table is the answer, and it also powers the live board and the deferral history for free.
13. **Optimistic concurrency on the plan.** Two dispatchers, one plan. A `version` check on write prevents lost updates.
14. **Notification delivery to the store manager.** The brief requires *"clear notice when an order is deferred"*. In-app is sufficient; don't add email or SMS.
15. **ETA recomputation.** The store manager's stated need is an expected arrival time. A static planned time degrades to a lie the moment a route runs late — recompute from the last recorded stop.
16. **Decimal, not float, for weights and volumes.** Capacity checks compared with floating point produce off-by-a-hair infeasibility that is maddening to debug.
17. **Seeded demo reset.** A "reset to day 0" action so you can re-run the walkthrough cleanly in the demo video and so judges can retry.

---

## §11 — Feature suggestions: high impact, feasible in the time

Ordered by judging value per hour. Everything here is additive and compatible with whatever the Figma contains — these slot into existing screens rather than requiring new flows.

### Tier 1 — build these

**1. "Why this plan" explainability panel** *(targets the 20% allocation criterion)*
A collapsible panel on the plan board stating, in sentences: the binding resource, the numbers behind it, and the counterfactual. On S1 it would read:

> *"28 of 38 vehicles available; 10 in the workshop. Chilled demand 181.6 m³ against 172.4 m³ of reefer capacity across two trips — and the only available reefer van is fully committed to three `van_only` chilled orders in Colombo, leaving 158.4 m³ of reefer-truck capacity for 175.6 m³. **17.2 m³ of chilled Fresh must be deferred.** Ambient capacity is not binding: 22 ambient trucks cover all 49 ambient Fresh orders with ~68% of their time budget unused. Returning one reefer truck from the workshop would clear the shortfall."*

No other feature does as much for the two heaviest criteria. The numbers are already computed by your validator; this is presentation, not new logic.

**2. Deferral ledger with repeat-skip protection** *(directly answers a named booklet problem)*
A persistent record of who was deferred, why, and for how long — with outlets at `days_since_last_served ≥ 3` escalated, and a hard warning when the allocator is about to defer an outlet that was `deferred_yesterday`. S1 ships 10 such outlets and 5 at 5 days, so the feature visibly fires in the demo. The booklet names this failure explicitly; closing it is unmissable.

**3. Offline banner with queue depth and a sync log** *(targets the 10% degradation criterion)*
"Offline · 4 actions queued" → "Syncing 2 of 4" → "All synced 05:48". Make it impossible for a judge to wonder whether offline works. Pair it with a deliberate demo moment: toggle airplane mode on camera, record two stops, re-enable, show them land.

**4. Live route progress board** *(closes the dispatcher's stated blind spot)*
SSE-driven. Per trip: current stop, stops remaining, late-risk flag. The booklet says dispatchers *"usually learn about a problem only after a driver has reached the outlet"* — this is the fix, and SSE makes it a few hours of work.

### Tier 2 — build if ahead of schedule

**5. What-if simulator.** Toggle a workshop vehicle back to available, re-run the allocator, show the delta in deferred volume. On S1 it demonstrates the reefer bottleneck interactively and makes the fleet-planning stage (workflow stage 7) tangible.

**6. Pre-cutoff capacity gauge.** Before 16:00, show demand accumulating against capacity with chilled tracked separately, so the dispatcher sees a shortfall coming rather than discovering it at cutoff. Cheap: it reuses the validator.

**7. LIFO loading sequence with a dock diagram.** Show the loader a simple vehicle-bay graphic with last-stop-first placement. Small, visual, demos beautifully, and answers *"loaded in an order that supports unloading"* literally.

**8. Constraint chips on every order card.** `van_only`, `chilled`, `mall 10:00–12:00`, `deferred yesterday`. Makes the domain legible at a glance and feeds the "domain accuracy" impression throughout.

### Tier 3 — only if genuinely ahead

**9. Demand forecast panel** reading a static JSON of Task 2A outputs. Satisfies workflow stage 7 visually and bridges to the Datathon. The booklet explicitly does **not** require Datathon integration, so keep it read-only and trivial.

**10. Service-time and late-risk badges** on stops, from a stored lookup rather than a live model. Your derived baselines (mean 19 min service, 19.6% historical lateness) make even a simple heuristic defensible.

> **What to skip, deliberately:** real map/GPS routing (the dataset gives you district travel times — use them; a map is weeks of work and earns nothing), route optimisation beyond greedy (`R1` already fixes trips to one district, so there is little left to optimise), native apps (explicitly optional), push notifications, multi-language, and any ML inside the web app. Each of these has cost judging points for teams who chased them instead of finishing the walkthrough.

---

## §12 — Figma design audit

Access confirmed on file `nfP1ZRvqcF2cJ4cWeZqyvT` ("Waypoint Operations – Planning (Confirmed Orders)"). Read via `get_metadata` (full node tree) and spot-checked with `get_screenshot` on the dashboard, the planning/exceptions screen, and the defer-order modal.

### 12.1 — The headline finding: this file is Dispatcher-only, and that's load-bearing for the plan

The document has **one page**, canvas `412:8554`, named "Dispatcher." Every pixel-built screen in the file belongs to the dispatcher role. The file's own internal documentation (a "Reference · Flows & Rationale" section) states the intended scope explicitly:

| Role | Screens named + rationale written | Screens actually built as hi-fi frames |
|---|---:|---:|
| **Dispatcher** | 21 | **21** (plus ~150 interactive-state variants — see 12.3) |
| Store manager | 10 | **0** |
| Loader | 6 | **0** |
| Driver | 16 | **0** |

The file contains full personas for all four roles (`Persona · Dilani Mendis` [Dispatcher], `Kamal Jayawardena`, `Kasun Perera`, `Shanika Munasinghe`) and a named, one-paragraph rationale for every one of the 53 planned screens — including the 22 that aren't built yet. So the *thinking* exists for all four roles; the *pixels* exist for one.

**This is very likely deliberate, not a gap** — the file name itself is scoped to "Planning (Confirmed Orders)," suggesting your team may have split the Designathon work across multiple Figma files, with Store Manager / Loader / Driver living elsewhere. **Confirm this with whoever owns the design before treating it as missing work.** If separate files exist, share those links and I'll fold them into this audit. If they don't exist yet, §12.6 below gives you the gap list and the rationale text is a running start — every one of those 22 unbuilt screens already has a title, a problem-tag (P1–P7), and a one-paragraph brief sitting in the file, ready to design from.

### 12.2 — Dispatcher screen inventory (all built)

**Step 1 · Confirmed Orders** — 1A Confirmed Orders · 1B Selection & bulk actions · 1C Map split view
**Step 2 · Generate Plan** — 2A Generating plan (5-stage progress) · 2B Plan ready
**Step 3 · Review Allocation** — 3A Review allocation · 3B Drag to rebalance · 3C Vehicle plan review (drawer) · 3D Change vehicle (modal)
**Step 4 · Resolve Exceptions** — 4A Exceptions triage · 4B All exceptions resolved · **4A+ Defer order (reason required)** ← the degradation screen
**Step 5 · Confirm & Send** — 5A Confirm & send · 5A+ Send confirmation (modal) · 5B Plan sent
**Deferred Orders Flow** — 6 Deferred Orders
**Shell / persistent** — Dashboard · Orders (+ Order Detail) · Live Operations (+ Fleet) · Exceptions · Profile · Capacity Forecast · Capacity Decision (W47–W48) · Login

That's the full 21. Every planning step maps cleanly to the booklet's workflow stages 2, 3, and 7 (§3).

### 12.3 — Interactive-state coverage (exceptional, and worth calling out)

Beyond the 21 base screens, there is a dedicated section (`Dispatcher · Interactive action states`) with roughly **150 additional frames** covering real interaction states rather than just static mockups: search and filter on every list screen, three sort orders on Confirmed Orders, per-vehicle allocation drill-downs (VEH014, VEH021, VEH027, VEH033, VEH055, VEH009 — six vehicles individually detailed), six named exception-type screens, six live-vehicle tracking states, CSV export preview, notification/profile/logout flows, and a **12-screen defer sequence** walking through four separate orders being individually deferred with running "exceptions remaining" counters (3→2→1).

For a design file at this stage of a 15-day competition, this is unusually thorough — most teams submit the five-to-eight static screens the brief technically requires. **This is a genuine strength to highlight in the Designathon submission and in the Hackathon's "fidelity to Day 5" score**, provided the build actually implements a meaningful slice of these states rather than just the happy path.

### 12.4 — Degradation screen: confirmed strong, and already past brief minimum

The brief requires **one** fully developed failure screen. The file has it, done well, and arguably exceeds the requirement:

**4A+ · Defer order (reason required)** — screenshot-verified. A dispatcher deferring `ORD-1204` sees:
- A **"2nd skip"** badge — meaning the design already implements repeat-deferral visibility, independently of anything in my §11 feature list
- Five required reason codes: *No refrigerated space on Colombo Fresh trips · Capacity overflow on all feasible vehicles · Outside delivery window · No van available for a van-only outlet · Other (add a note)*
- These map **exactly** to the dataset's real constraint taxonomy (`R2` reefer, `R6` capacity, `R8` window, `R3` van_only) — strong domain accuracy
- A "What this means" consequence panel: *"OUT031 will be skipped two runs in a row... Days since last served becomes 4... The order moves to the Wed 30 Sep run and is protected as first priority"*
- Two toggles: **notify the store manager now** (direct answer to the brief's *"clear notice when an order is deferred"*) and **protect on the next run** (direct answer to *"leave the same outlet unserved on consecutive runs"*)
- An audit line: *"Recorded as Dilani Mendis · Mon 28 Sep 16:42"*

The companion **Exceptions triage** screen (4A) categorizes all open exceptions into exactly four types — `Van-only access` · `No refrigerated vehicle` · `Capacity overflow` · `Window conflict` — each with a ranked "suggested fix," a "best of 3" label, and a live "Impact of applying all 4" delta panel (orders allocated 181→185, vehicles 14→15, avg utilisation 87%→88%). This is a genuinely well-designed explainability surface, and it is very close in spirit to the "Why this plan" panel recommended in §11 Tier 1 — **that suggestion is now largely redundant with what's already designed; redirect that effort to building it faithfully instead.**

**Gap within the degradation story:** the booklet's other named failure scenarios — the driver losing connectivity, the loader catching a shortfall before departure — have **no built screen**, only the rationale-card one-liners noted in 12.1 (`Driver · Offline Sync`, `Driver · Back online (reconcile)`, `Loader · Issues`). If D2 (offline driver) and D3/D4 (loader shortfall/stale list) from §8 matter to your Hackathon score, they currently have to be designed from scratch during the build, or built directly from code against the rationale text with no visual reference.

### 12.5 — Design system, extracted from screenshots

| Token | Observed value | Notes |
|---|---|---|
| Sidebar background | Near-black (~`#0B0B0F`) | Full-height, persistent across all screens |
| Brand accent | Amber/yellow (~`#F5A623`–`#F0B429` range) | Active nav pill, primary buttons, progress bars, logo mark |
| Content background | White | Card-based layout throughout |
| Status pills | Amber = warning (*"Late time window"*, *"2nd skip"*) · Red = blocking (*"No available vehicle"*, *"Requires refrigeration"*, *"Outside service area"*) · Green = healthy (*"All systems operational"*) | Consistent semantic color use — carry this straight into a Tailwind/shadcn theme |
| Navigation | Fixed left sidebar: Home, Orders, Planning, Live Operations, Forecast, Fleet, Exceptions (badge-counted), Deferred Orders, Settings | Matches the booklet's stage list closely |
| Top bar | Depot switcher · global search (⌘K) · help · notifications · profile/role chip | Depot switcher confirms the two-depot (Peliyagoda/Kandy) model is first-class in the UI, not an afterthought |
| Typography | Clean sans-serif, strong size hierarchy (large page titles, dense data rows) | Dashboard reads like a real ops tool, not a demo |
| Modal pattern | Centered overlay, dimmed backdrop, radio-button reason selection, toggle switches, dual CTA (secondary Cancel + primary action) | Reuse this exact pattern for every "decision" interaction across roles for consistency |

This is enough to derive a working `tailwind.config` (dark sidebar, amber primary, semantic red/amber/green status tokens, card radius/shadow scale) directly from the screenshots without needing a formal style guide export — recommend doing this on Day 1 of the build (§13) so the Dispatcher UI is pixel-faithful from the start.

### 12.6 — Coverage matrix: the seven workflow stages × four roles

| Stage | Role | Status |
|---|---|---|
| 1 Place order | Store manager | **Not built** — rationale only |
| 2 Close orders | Dispatcher | **Built** — 1A Confirmed Orders |
| 3 Plan and allocate | Dispatcher | **Built, extensively** — Steps 2–4, allocation, exceptions, defer flow |
| 4 Load | Loader | **Not built** — rationale only (6 screens named) |
| 5 Deliver | Driver | **Not built** — rationale only (16 screens named, incl. offline/sync) |
| 6 Confirm receipt | Store manager | **Not built** — rationale only |
| 7 Plan future capacity | Dispatcher | **Built** — Capacity Forecast, Capacity Decision |

**3 of 7 stages are pixel-ready; all 3 belong to the one role that won't be judged on a phone.** The brief is explicit that *"judges will assess the driver and loader experiences on phone-sized screens"* — which is precisely the 60% of the workflow with no visual reference yet. This is the single most important scheduling fact for §13: budget real design time (even rough, even during the build) for Store Manager, Loader, and Driver, or accept that those three roles get built directly from the rationale text and your own judgment against the booklet, using the Dispatcher screens' established design system for visual consistency.

### 12.7 — Designathon reference material (bonus: largely done already)

The file also contains, as dedicated reference frames, most of the Designathon's written deliverables:

- **Problem framing** — P1–P7, each one sentence, directly traceable to booklet language (e.g. *P3: "Deferrals have no record; the same outlet can be skipped repeatedly"*)
- **Personas** — all four roles named with photo-style persona cards; Dispatcher's is fully fleshed out (a day in the life, goals, frustrations tagged back to P1–P3, needs from other roles); the other three exist but weren't fully inspected depth-wise
- **Service blueprint** — the 7-stage × 4-role matrix itself, as a designed artifact — Store manager row 4/7 filled, Dispatcher 6/7, Loader 1/7, Driver 3/7 (the blueprint's own gaps mirror the screen-building gaps exactly, so this isn't new information, but it confirms the gap is known and tracked, not accidental)
- **Core tradeoff explanation** — "Assisted allocation, not full automation," a clean 3-step diagram (system proposes → dispatcher decides → system records and tells), directly justifying the scope decision to keep a human in the loop. This answers the booklet's optional one-page tradeoff deliverable well.
- **AI tool disclosure** — present, structured (tools used, AI-assisted work, human work, how output was checked) — **but its own status line reads "Draft. The team must review and edit this page so that it is accurate before submission."** This is a live action item, not a finished deliverable — flag it to whoever is compiling the Designathon submission package.

### 12.8 — Fidelity risk list for the Hackathon build

| Designed element | Build cost | Recommendation |
|---|---|---|
| Live "Impact of applying all 4" delta panel on Exceptions | Medium — requires the allocator to support a dry-run re-simulation | Worth building; it's cheap once `validate.ts` (§5) exists, since a dry-run is just running it against a hypothetical plan |
| Six individually-detailed vehicle drill-downs, six live-vehicle states | Low–medium if data-driven off the `Vehicle`/`Trip` tables; high if hand-built per vehicle | Build one generic drill-down component parameterized by `vehicleId` — do **not** hand-build six screens |
| ⌘K global search | Low | A simple client-side filter across orders/outlets is enough; don't build a search index for a 3-day deadline |
| CSV export preview modal | Low | Straightforward; low priority unless time allows |
| Map split view (1C) | **High** — real mapping is explicitly flagged as out of scope in §11 | Approximate with a district-grouped list/cluster view using `district_travel.csv` coordinates-free data, not an actual map; note the substitution in the README as a documented departure from Day 5 |
| 150 interactive-state variants | High in aggregate | Implement as component states (loading/error/filtered/sorted) driven by real app state, not as 150 separate hand-built screens — this is normal frontend engineering, not 150x the work, provided components are built data-driven from the start |

### 12.9 — Net assessment

The Dispatcher experience is the strongest part of this submission by a wide margin — detailed, domain-accurate, consistent, and already thinking in terms of explainability and repeat-deferral protection, which is exactly what the booklet and the S1 data analysis (§5) call for. Lean into building it faithfully; much of §11 Tier 1 is already solved in the design rather than needing to be invented during the build.

The risk is entirely in the other three roles and three of the seven workflow stages, which currently exist only as names and one-paragraph rationales. Resolve the open question in 12.1 **today** — are Store Manager, Loader, and Driver designed in a separate Figma file, or not yet designed at all — because the answer changes Day 1 of §13 materially. If separate files exist, send the links and this audit extends to them in minutes. If they don't, the 22 rationale write-ups already in this file are a genuinely strong starting brief to build screens from directly, using the Dispatcher file's design system (12.5) for visual consistency, rather than designing from nothing.

---

## §13 — Three-day build plan

Working backwards from Sunday 4 October 23:59. Aggressive but achievable, and ordered so that **you always have something submittable**.

### Day 1 — Wednesday 1 October: foundation

| Priority | Task |
|---|---|
| P0 | Repo scaffold, `docker-compose.yml`, `.env.example`, Prisma schema from §7 |
| P0 | **Seed script** loading all five reference CSVs + one realistic delivery day |
| P0 | **Deploy a hello-world end-to-end.** Do this today, not Saturday. |
| P0 | `lib/engine/tripTime.ts` + `rules.ts` with the booklet's 101/112/213 fixtures as passing tests |
| P1 | Auth + four seeded accounts + role middleware |
| P1 | Unblock Figma (§0) and complete §12 |

### Day 2 — Thursday 2 October: the core

| Priority | Task |
|---|---|
| P0 | `validate.ts` — whole-plan feasibility with named rule violations |
| P0 | `allocate.ts` — greedy allocator with priority score and deferral reasons |
| P0 | **Verify the engine reproduces the S1 analysis in §5.** If it doesn't find the reefer bind, it's wrong. |
| P0 | Dispatcher plan board: queue → allocate → trips → deferred, with the constraint panel |
| P1 | Store manager: place order + confirmation + order status |
| P1 | "Why this plan" panel (Tier 1 #1) |

### Day 3 — Friday 3 October: the mobile roles

| Priority | Task |
|---|---|
| P0 | Loader: load list in LIFO order, tick-off, shortfall flag → dispatcher alert |
| P0 | Driver: trip view, per-stop record, POD — **phone-sized, judged on phone** |
| P0 | Offline: service worker, IndexedDB outbox, `/api/sync` with idempotency |
| P0 | Store manager: confirm receipt + deferral notice |
| P1 | Live progress board (SSE) |
| P1 | Deferral ledger (Tier 1 #2) |

### Day 4 — Saturday 4 October: ship

| Time | Task |
|---|---|
| Morning | **End-to-end walkthrough rehearsal on the deployed URL**, all four roles, fresh database |
| Morning | Fix whatever that breaks — reserve real time here; it always breaks |
| Midday | `docs/architecture.md` + diagram · `docs/data-model.md` + ERD · `docs/ai-tool-disclosure.md` |
| Midday | README: setup, credentials, **numbered judge walkthrough**, departures from Day 5 design |
| Afternoon | **Verify `docker compose up` on a clean clone with no volumes** |
| Afternoon | Record the 5–8 min demo: four roles completing the walkthrough, then code + architecture |
| Evening | Upload unlisted to YouTube, submit the form. **Do not push code after the deadline** — it will not be considered. |

### If you fall behind, cut in this order

1. Tier 2 and Tier 3 features (§11) — all of them
2. Live progress board → replace with a manual refresh
3. Automatic allocation → fall back to **manual assignment with validation**, which the brief explicitly permits and which still scores on the allocation criterion
4. Style and Tech brands → Fresh-only demo, documented as a scope decision

**Never cut:** the four-role walkthrough, `docker compose up`, the deployed URL, the three `docs/` files, or the demo video. Those are pass/fail deliverables, and several carry weight far out of proportion to the hours they take.

---

## §14 — Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Figma stays inaccessible | Fidelity score (10%) and rework | Export to PDF/PNG — §0. Resolve today. |
| `docker compose up` fails on a fresh machine | Multiple criteria; possibly unreviewable | Test on a clean clone, no volumes, Saturday afternoon at the latest |
| Deployment issues discovered late | Functional completeness (20%) | Deploy hello-world **today** |
| Offline sync half-built | Degradation (10%) | Idempotency first; it is the part that cannot be bolted on later |
| Allocator produces infeasible plans | Allocation (20%) | Validator before allocator; re-validate before publish; S1 as the acceptance test |
| Over-scoping the UI | Everything | Tier 1 only until the walkthrough runs end to end |
| Mobile roles tested only on desktop | Driver and loader are judged **on phones** | Test on a real phone daily, not in DevTools |
| Timezone bugs around the 16:00 cutoff | Domain accuracy, confusing demo | `TZ=Asia/Colombo` in the container; `timestamptz` everywhere |

---

## §15 — Phase 3 (Datathon) notes, carried forward

Not this phase's work, but worth capturing now because the groundwork is free while the data is fresh. Deadline **Friday 9 October**. Judged **separately** — integration into the Hackathon build is explicitly **not required**.

**Task 1 — service time and lateness.** Labels are not supplied; constructing them correctly is itself assessed. The derivation that matches the booklet's wording:

```
service_min = leave_outlet_time − max(arrival_time, window_open_time)
                                  └─ because "a vehicle that arrives early waits"
is_late      = arrival_time > window_close_time
```

Validated against the 91,894 training legs, this gives **mean service 19.0 min / median 15 / p10 8 / p90 32** and a **19.6% late rate** — plausible, well-distributed figures, which is good evidence the derivation is right. Features available at prediction time: brand, `dock_type`, `order_units`/`weight`/`volume`, district, `road_class`, hour-of-day via `traffic_speed`, `monsoon`, `disruption_index` from `road_conditions`, `dow`, and the calendar flags. Note the constraint: **actual times exist only in the training route records**, so nothing derived from `actual_*` may be used as a test-time feature.

**Task 2A — weekly depot demand.** 60 rows (2 depots × 3 brands × 10 weeks). Count **every** order including `deferred` and `not_run` — they are still demand. Group by the week the store **requested** the order, using `iso_year`/`iso_week` from `calendar.csv`. **Set `pred_chilled_volume_m3 = 0` for Style and Tech** — only Fresh has chilled demand, and the training data confirms it.

**Task 2B — peak-day allocation.** §5 is already most of the written prioritisation policy, and if you build the engine as specified it can generate `submission_task2b.csv` directly. Run `check_allocation.py` before submitting. Remember that passing the checker confirms feasibility, **not** quality — the policy write-up is where the 15% actually sits.

**Rules to respect:** no pre-trained models (except for synthetic data generation or preprocessing), no proprietary API-based modelling or preprocessing, no low-code/no-code or fully automated end-to-end AutoML tools.

---

## Appendix — Quick reference

**Dataset locations**
```
dataset/data/General Data/{outlets,vehicles,calendar,district_travel,
                           service_allowance,traffic_speed,road_conditions}.csv
dataset/data/Training Data/{deliveries_train,route_legs_train}.csv
dataset/data/Test Data/{task1_test_inputs,route_legs_test,task2a_test_inputs,
                        task2b_peak_day_scenarios,task2b_peak_day_fleet}.csv
dataset/data/Submission Templates/submission_task{1,2a,2b}.csv
```

**Numbers to seed and assert against**
```
120 outlets   Fresh 80 (49 Pel / 31 Kandy) · Style 25 (16/9) · Tech 15 (10/5)
 60 vehicles  40 ambient trucks · 12 reefer trucks · 4 ambient vans · 4 reefer vans
              → 16 reefer, 8 vans, 4 reefer vans
 12 districts 1:1 to depot · 13 van_only outlets · 12 mall outlets
 trip budgets Fresh 270 min (03:30–08:00) · Style+Tech 480 min · max 2 trips/vehicle/day
 cutoff       16:00 Asia/Colombo · operates Mon–Sat
```

**Deadlines**
```
Hackathon  Sunday  4 October 2026, 23:59 Asia/Colombo
Datathon   Friday  9 October 2026, 23:59 Asia/Colombo
```
