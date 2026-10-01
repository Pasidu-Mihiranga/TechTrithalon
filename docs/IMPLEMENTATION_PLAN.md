# TechTrithalon — Waypoint Operations Implementation Plan

This is the daily build plan for a **nine-member team**. It answers what to build next, what can proceed in parallel, and how each phase is verified. Technical reasoning, domain facts, diagrams, and full feature definitions live in the [Waypoint Technical & Domain Reference](./TECHNICAL_REFERENCE.md).

## Master Progress

All boxes start unchecked. Check a phase only after its exit gate passes in the running system; documentation alone is not evidence. The next required phase is **Phase 0**, unless the team records verified implementation evidence here.

- [ ] Phase 0 — Repository & Development Foundation
- [ ] Phase 1 — Design System & Application Shell
- [ ] Phase 2 — Authentication & RBAC
- [ ] Phase 3 — Reference Data Foundation
- [ ] Phase 4 — Store Manager Order Flow
- [ ] Phase 5 — Dispatcher Confirmed Orders
- [ ] Phase 6 — Trip-Time & Constraint Engine
- [ ] Phase 7 — Manual Planning First
- [ ] Phase 8 — Deferral & Fairness
- [ ] Phase 9 — Automatic Planning
- [ ] Phase 10 — Explainability & Exception Resolution
- [ ] Phase 11 — Plan Publication & Versioning
- [ ] Phase 12 — Loader Workflow
- [ ] Phase 13 — Driver Workflow
- [ ] Phase 14 — Offline & Sync
- [ ] Phase 15 — Receipt Confirmation
- [ ] Phase 16 — Live Operations
- [ ] Phase 17 — Forecasting Foundation
- [ ] Phase 18 — Service-Time & Late-Risk ML
- [ ] Phase 19 — Capacity Decision Support
- [ ] Phase 20 — Advanced Decision Support
- [ ] Phase 21 — System Hardening
- [ ] Phase 22 — Full-System Verification

## 1. How to Use This Plan

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

- [ ] Scaffold Java 21 Spring Boot modular monolith, health endpoint, `Clock`, error envelope, and OpenAPI.
- [ ] Expose a small API endpoint consumed by the web app.

#### Frontend

- [ ] Scaffold React, TypeScript, Vite, router, query provider, and generated OpenAPI client.

#### Database

- [ ] Start PostgreSQL with Docker Compose; create baseline Flyway migration.
- [ ] Add idempotent reference seed/import and a documented demo operating date.

#### Python / Intelligence

- [ ] Scaffold Python project, FastAPI health endpoint, Pydantic contracts, and pytest; no operational DB credentials.

#### Testing

- [ ] Run migrations from an empty DB, seed twice without duplicates, and smoke-test React → Spring and Spring → Python.
- [ ] Set CI for Gradle/JUnit, frontend lint/typecheck/Vitest, Python pytest, contract drift, and Compose smoke.

#### Documentation

- [ ] Write root `.env.example`, local setup, seed/reset instructions, and service ownership.

### Parallel Work for 9 Members

Scaffold API, web, database seed, and Python health in parallel after agreeing on ports and configuration. Join at the OpenAPI contract and Compose smoke test.

### Exit Gate

- [ ] All services start through one Compose command.
- [ ] Empty database migrates and seeds repeatably.
- [ ] Frontend reaches Spring; Spring health-checks Python; CI is green.

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

- [ ] Expose session/role shell metadata only as needed for UI integration.

#### Frontend

- [ ] Extract Figma tokens for color, type, spacing, status, and responsive breakpoints.
- [ ] Build shared button, input, select, badge, card, table, dialog, drawer, sidebar, and top bar used by the first screens.
- [ ] Add role shells and loading, empty, error, and unauthorized states.

#### Database

- [ ] No migration required; retain token JSON in the repository.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [ ] Use Vitest/Testing Library for stateful primitives.
- [ ] Check keyboard focus, contrast, and 375 px/desktop layouts; visually compare the dispatcher shell to Figma.

#### Documentation

- [ ] Record token source and mark missing role screens for final Figma verification.

### Parallel Work for 9 Members

Token extraction, shell layout, and accessibility review can progress in parallel. Synchronize on token names and shared component props before feature pages consume them.

### Exit Gate

- [ ] First role shell renders from shared components.
- [ ] Core controls match the current Figma language.
- [ ] Responsive and accessibility checks pass.

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

- [ ] Implement login/logout, opaque session, expiry, role guards, data-scope checks, and actor context.
- [ ] Return consistent 401/403; hide unowned resources with 404 where applicable.

#### Frontend

- [ ] Build login, session restore, role redirect, Forbidden state, and logout.

#### Database

- [ ] Create users, roles, session store, and four seeded role accounts with hashed passwords.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [ ] Test passwords, expiry, CSRF/session behavior, and every role against each route family.
- [ ] Playwright login/logout and cross-role access.

#### Documentation

- [ ] Document seeded roles, credential configuration, and auth boundaries.

### Parallel Work for 9 Members

Identity schema/API and login UI can progress together against an agreed response contract. Security tests independently probe role and data scope; integrate before exit.

### Exit Gate

- [ ] Four seeded accounts reach their own shell.
- [ ] Wrong role and wrong owner are rejected by API and UI.
- [ ] Audit actor identity is available to later modules.

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

- [ ] Implement read APIs and fleet availability transitions.
- [ ] Derive effective mall windows and reject empty intersections.

#### Frontend

- [ ] Add only the fleet/outlet selectors needed by order and planning flows.

#### Database

- [ ] Import CSVs idempotently with natural IDs; persist availability and weekly fuel ledger.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [ ] Assert 120 outlets, 60 vehicles, 12 districts, 13 van-only outlets, 12 mall outlets, and exact fleet mix.
- [ ] Test workshop status, mall intersection, and role-scoped reads against PostgreSQL.

#### Documentation

- [ ] Record source CSV paths, verified counts, and any date-extension policy.

### Parallel Work for 9 Members

CSV/import work, API contract, and selectors can advance in parallel. Synchronize on enum values, ID formats, and seed assertions.

### Exit Gate

- [ ] Reference counts and invariants match supplied files.
- [ ] Read APIs return real seeded data.
- [ ] Invalid mall windows fail import.

### Result

After this phase, the system can use verified operational reference data.

## Phase 4 — Store Manager Order Flow

### Goal

Complete store manager order flow as a tested feature slice.

### Why This Phase Comes Now

Confirmed orders are the input to every planning run.

### Dependencies

- Phases 2–3.

### Main Work

#### Backend

- [ ] Implement order state machine, validation, server-side 16:00 Asia/Colombo cutoff, and next operating-day selection.
- [ ] Permit same-day ambient and chilled Fresh orders.

#### Frontend

- [ ] Build Place Order → Review → Confirm → My Orders → Order Detail, including form errors and empty state.

#### Database

- [ ] Add customer order, indexes, version, and audit fields.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [ ] Test cutoff boundary, Sunday/holiday rollover, two-temperature orders, ownership, and bad quantities.
- [ ] Playwright the complete store order slice.

#### Documentation

- [ ] Document order lifecycle and cutoff behavior.

### Parallel Work for 9 Members

Order schema/domain and React form can proceed against an agreed API DTO; integration waits for migration and generated client.

### Exit Gate

- [ ] A store manager confirms a persisted order through the UI.
- [ ] Dispatcher-facing status is confirmed and auditable.
- [ ] Cutoff and ownership tests pass.

### Result

After this phase, the system can capture real confirmed demand from stores.

## Phase 5 — Dispatcher Confirmed Orders

### Goal

Complete dispatcher confirmed orders as a tested feature slice.

### Why This Phase Comes Now

A dispatcher needs a precise and stable planning input set.

### Dependencies

- Phases 3–4.

### Main Work

#### Backend

- [ ] Add date/depot-scoped confirmed-order query, pagination, search, sorting, and selection rules.
- [ ] Create immutable planning snapshots with order IDs, fleet, weekly fuel, calendar, rule version, and content hash.

#### Frontend

- [ ] Build Figma confirmed-orders queue, detail, filter/sort, selection, and snapshot trigger.

#### Database

- [ ] Add planning snapshot table and appropriate order query indexes.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [ ] Test exact snapshot membership, immutability, hash changes, pagination, and role scope.
- [ ] Playwright queue and snapshot creation.

#### Documentation

- [ ] Document snapshot fields and reconciliation when inputs change.

### Parallel Work for 9 Members

Queue UI and snapshot service can advance in parallel on agreed read models; integrate after ordering and reference APIs settle.

### Exit Gate

- [ ] Dispatcher can inspect the exact closed order set.
- [ ] A snapshot freezes all inputs needed for a planning attempt.
- [ ] Repeated reads reproduce the same snapshot.

### Result

After this phase, the system can freeze the inputs of a planning run.

## Phase 6 — Trip-Time & Constraint Engine

### Goal

Complete trip-time & constraint engine as a tested feature slice.

### Why This Phase Comes Now

Correct feasibility rules must exist before assignments or optimization.

### Dependencies

- Phases 3 and 5; no Python dependency.

### Main Work

#### Backend

- [ ] Implement trip-time, distance/fuel, effective mall window, waiting, and named R1–R12 rule predicates.
- [ ] Return structured violations with actual, allowed, and remediation evidence; build independent whole-plan validator.

#### Frontend

- [ ] Add reusable constraint and utilisation display components for later planning screens.

#### Database

- [ ] Add only the persistence needed for rule evidence and weekly fuel state; use precise decimal quantities.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [ ] JUnit/AssertJ tests for every rule, positive and negative cases; 101/112/213 fixtures.
- [ ] Use Testcontainers for database constraints; run S1 rule/shortage diagnostics without asserting an unproven optimum.

#### Documentation

- [ ] Link rule codes and trip-time formula to [Technical Reference — Constraint Engine](./TECHNICAL_REFERENCE.md#16-constraint-engine).

### Parallel Work for 9 Members

Rule predicates can be split by scope while one owner protects shared rule interfaces. UI evidence component and dataset fixtures can advance separately; merge through the whole-plan validator.

### Exit Gate

- [ ] Every hard rule has boundary tests.
- [ ] Booklet trip-time fixtures pass.
- [ ] Validator names why hand-built invalid plans fail.

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

- [ ] Create/edit candidate plans and trips; assign, move, remove, and resequence orders through validate-then-apply services.
- [ ] Add a minimal publication gate so invalid plans cannot become operational; full version lifecycle follows in Phase 11.

#### Frontend

- [ ] Build plan board, vehicle/trip assignment, utilisation bars, named violation feedback, and manual defer action.

#### Database

- [ ] Add plan/trip/stop tables, candidate version, optimistic lock, and within-plan uniqueness.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [ ] Test invalid edits roll back; test whole-order and two-trip limits within a candidate.
- [ ] Playwright a complete manual plan and rejected move.

#### Documentation

- [ ] Record manual planning semantics and the difference between candidate and published plans.

### Parallel Work for 9 Members

Plan persistence/API and board UI can advance against a contract; validator remains the integration point. Review the candidate schema together before migration.

### Exit Gate

- [ ] Dispatcher creates a feasible candidate and explains every unassigned order.
- [ ] Invalid edits and publication attempts persist nothing.
- [ ] Manual path works with Python stopped.

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

- [ ] Record reasons, rule evidence, previous operating-day deferral, days since last served, protect-next-run, and notifications.
- [ ] Require explicit reason and record who decided.

#### Frontend

- [ ] Build defer dialog, repeat-skip warning, consequence text, deferred-order view, and store notice.

#### Database

- [ ] Add append-only deferral and notification records with indexes for outlet history.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [ ] Test two consecutive operating days, protected carry-forward, missing reason, store visibility, and audit history.

#### Documentation

- [ ] Document deferral policy and reason-code mapping to Figma.

### Parallel Work for 9 Members

Deferral history service, notification display, and UI dialog can proceed in parallel. Synchronize on reason codes and history semantics before E2E.

### Exit Gate

- [ ] A repeated skip is visible and justified.
- [ ] Protected orders carry forward.
- [ ] Store manager sees a clear deferral notice.

### Result

After this phase, the system can record and explain every skipped order.

## Phase 9 — Automatic Planning

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

### Parallel Work for 9 Members

Greedy service, CP-SAT research, run UI, and S1 fixtures can progress in parallel after the contract freezes. Candidate persistence and Spring validation are the merge gate.

### Exit Gate

- [ ] Every automatic candidate passes independent validation.
- [ ] Python failure returns a valid greedy option or manual path.
- [ ] S1 outcomes are measured rather than hard-coded.

### Result

After this phase, the system can generate feasible candidates automatically without depending on Python availability.

## Phase 10 — Explainability & Exception Resolution

### Goal

Complete explainability & exception resolution as a tested feature slice.

### Why This Phase Comes Now

A dispatcher must understand and change the candidate before publication.

### Dependencies

- Phases 7–9.

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

### Parallel Work for 9 Members

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

- Phases 7–10; minimal gate from Phase 7.

### Main Work

#### Backend

- [ ] Make publish one transaction: revalidate persisted plan, account for all orders, supersede prior version, commit weekly fuel, create load tasks, and write audit.
- [ ] Implement republish conflict handling, stale-version response, and version diff.

#### Frontend

- [ ] Build Confirm & Send, published state, and current-version indicators.

#### Database

- [ ] Add partial unique current-plan index; keep candidate/historical plans coexisting; stamp load tasks with version.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [ ] Test invalid publish rollback, concurrent publishes, republish, double fuel accounting, and stale-version response.

#### Documentation

- [ ] Document publication invariants and recovery on conflict.

### Parallel Work for 9 Members

Publish service and Figma confirmation UI can progress together; DB uniqueness and fuel-ledger reviews are synchronization points.

### Exit Gate

- [ ] Only validated, fully accounted plans become current.
- [ ] Republish preserves old versions and signals stale clients.
- [ ] Fuel is committed exactly once per current plan.

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

- [ ] Expose depot trips and load tasks; record line confirmations and issues; block completion on unresolved shortfall.
- [ ] Return plan version and changes on stale requests.

#### Frontend

- [ ] Build tablet/phone load list in reverse stop order, issue reporting, completion, and stale-plan diff.

#### Database

- [ ] Add load-line and loading-issue records if not present in Phase 11.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [ ] Test LIFO order, issue blocking, handoff, role/depot scope, and mid-load republish E2E.

#### Documentation

- [ ] Record loader handoff and stale-list behavior.

### Parallel Work for 9 Members

Load API/data and mobile UI can progress in parallel from a published-trip contract; issue event and version diff are integration points.

### Exit Gate

- [ ] Loader completes a published trip’s load.
- [ ] Shortfall reaches dispatcher and can block departure.
- [ ] Republish displays a meaningful diff.

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

- [ ] Expose driver-owned trips/stops; record arrival, outcome, departure, and trip completion.
- [ ] Implement POD upload references, issue events, and deterministic ETA fallback.

#### Frontend

- [ ] Build phone-first trip overview, stop details, large outcome actions, POD capture, and completion states.

#### Database

- [ ] Add delivery records, POD metadata, and object-store configuration.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [ ] Test assignment ownership, state transitions, upload type/size, stop outcomes, and full online trip E2E on phone width.

#### Documentation

- [ ] Describe field action sequence and POD retention.

### Parallel Work for 9 Members

Delivery API/state machine, POD storage, and phone UI can advance in parallel after stop contract settles. Merge on one complete stop journey.

### Exit Gate

- [ ] Driver completes an assigned trip online.
- [ ] Proof and outcome are persisted with actor/time.
- [ ] Another driver cannot access the trip.

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
- [ ] Show pending count, retry, reconciling, conflict, and route-updated states.

#### Database

- [ ] Add sync command idempotency table and retention policy.

#### Python / Intelligence

Not required in this phase.

#### Testing

- [ ] Test offline reload, two stops recorded offline, reconnect, lost response/retry, duplicate replay, expired session, and stale version.

#### Documentation

- [ ] Document conflict policy and queue recovery.

### Parallel Work for 9 Members

Sync endpoint, IndexedDB outbox, and conflict UI can advance together on one command schema. Full airplane-mode journey is the synchronization gate.

### Exit Gate

- [ ] Offline actions survive reload and sync exactly once.
- [ ] Conflicts are visible without losing the field record.
- [ ] Completed stops stand across plan versions.

### Result

After this phase, the system can complete a route during coverage loss and reconcile it safely.

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

### Parallel Work for 9 Members

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

### Parallel Work for 9 Members

Read model and Figma live board can be developed in parallel; SSE wiring follows once event payloads settle.

### Exit Gate

- [ ] Driver action appears on dispatcher board promptly.
- [ ] SSE failure falls back to polling.
- [ ] Status and last-update are correct.

### Result

After this phase, the system can monitor active delivery operations.

## Phase 17 — Forecasting Foundation

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

### Parallel Work for 9 Members

Historical feature pipeline, persistence/API, and chart shell can progress in parallel after the forecast contract is fixed. Model promotion waits for holdout evaluation.

### Exit Gate

- [ ] Forecast source and version are visible.
- [ ] Baseline and candidate are evaluated on time holdout.
- [ ] Forecast limitations are shown.

### Result

After this phase, the system can view a reproducible depot/brand demand outlook.

## Phase 18 — Service-Time & Late-Risk ML

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

### Parallel Work for 9 Members

Feature engineering/evaluation and prediction display can advance independently on a sample contract; production activation waits for measured benefit.

### Exit Gate

- [ ] Every adopted model beats or usefully complements baseline on held-out data.
- [ ] No leaked actual-time feature enters inference.
- [ ] Hard constraints remain deterministic.

### Result

After this phase, the system can provide evidence-backed ETA and lateness estimates.

## Phase 19 — Capacity Decision Support

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

### Parallel Work for 9 Members

Fleet calculator, forecast UI, and interval analysis can proceed in parallel once units/horizon are fixed. Review every displayed number against the source data.

### Exit Gate

- [ ] No illustrative placeholder remains.
- [ ] Gaps and options trace to computed inputs.
- [ ] Dispatcher can record a decision.

### Result

After this phase, the system can make a transparent future-capacity decision.

## Phase 20 — Advanced Decision Support

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

### Parallel Work for 9 Members

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

- Functional Phases 0–20 as shipped.

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

### Parallel Work for 9 Members

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

- [ ] Exercise store, dispatcher, loader, driver, receipt, operations, and capacity paths with real service boundaries.

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

### Parallel Work for 9 Members

Workflow, failure, infrastructure, and documentation verification can happen in parallel on the same release candidate. Freeze interface changes and rerun affected journeys after every fix.

### Exit Gate

- [ ] Fresh startup and full workflow pass.
- [ ] All named failure journeys recover correctly.
- [ ] Another developer can follow docs and reproduce results.

### Result

After this phase, the system can run the complete system from order intake through capacity planning.

## 4. Release Evidence and Open Questions

Record evidence here as phases finish. Do not mark a phase complete from a local screenshot alone.

| Phase | Verification evidence | Date / owner |
|---|---|---|
| 0–22 | Pending | — |

- The accessible Figma file contains Dispatcher frames. Confirm whether Store Manager, Loader, and Driver frames exist elsewhere; use current rationale in the meantime.
- The supplied calendar ends on 2026-06-28. Choose a seeded demo date inside that range or add explicit later calendar records before testing cutoff and operating-day logic.
- Treat S1's ~17.2 m³ refrigerated shortfall as a lower bound. Record a feasible whole-order allocation before claiming an exact optimum.
- The technical reference identifies candidate-version uniqueness and audit transaction issues in the former schema narrative; use its corrected invariants in migrations.
