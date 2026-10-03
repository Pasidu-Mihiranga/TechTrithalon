# Round 2 requirements, implementation audit and execution order

Audit date: **2026-10-03, Asia/Colombo**. This is a requirements and verification review, not implementation of the remaining phases. Completion depends on correctness and exit-gate evidence, without deadline-based shortcuts.

## Authority and scope

The primary source is [Challenge Booklet.pdf](./Challenge%20Booklet.pdf), especially printed pages 3–7 and 12–13. Pages 20–21 provide the trip-time examples adopted by this project's validator. Page 15 explicitly separates Datathon predictions from the Hackathon build. Follow [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for phase dependencies and [AGENTS.md](../AGENTS.md) for repository rules. Existing implementation is React/Vite, Spring Boot, PostgreSQL and stateless Python; the Next.js/Prisma proposal in `WAYPOINT_PHASE2_ANALYSIS.md` is historical, not the current architecture.

Reviewed the booklet, root and package/fixture READMEs, implementation plan, work log, earlier verification records, technical/domain reference, design documentation and earlier gap analysis. Inspected current routing, ordering, snapshots, manual-plan persistence/services, rule calculations/tests, planning screens, Compose and CI configuration. Historical verification records are distinguished from checks rerun below; this is not a complete security or pixel-level review of every file.

## Round 2 scoring

Booklet printed page 13:

| Criterion | Weight | Evidence needed from this system |
|---|---:|---|
| Engineering quality and architecture | 25% | Reproducible Compose startup, sound state boundaries, real PostgreSQL tests, contracts, authorization, atomic writes and recovery |
| Functional completeness across all four roles | 20% | A connected planning → loading → delivery → store receipt walkthrough, including ordering |
| Planning and allocation engine | 20% | Feasible whole-order allocation, capacity shortfall, explicit deferrals and operating constraints |
| Degradation, offline operation and recovery | 10% | Durable offline field records, reconciliation and usable failure screens |
| Fidelity to the Day 5 design | 10% | Screen/behavior comparison with the actual submitted prototype and documented significant departures |
| Demo video | 10% | Unlisted five-to-eight-minute video covering four roles, code and architecture |
| Creativity | 5% | Useful improvements grounded in working behavior |

These weights do not justify leaving mandatory requirements unfinished. No score estimate is asserted by this audit.

## Required capabilities and deliverables

| Requirement | Current evidence | Remaining work |
|---|---|---|
| Responsive web app for all four roles; phone-sized loader and driver | Four accounts and guarded shells exist | Loader/driver feature routes still resolve to placeholders |
| Capture/confirm orders; 16:00 cutoff and closed queue | Ordering services, database tests, prior curl/browser evidence | Preserve the verified flow; reconcile aggregate orders with the submitted product/line-item experience |
| Allocate orders to vehicles/trips under operating constraints | Independent R1–R12 engine and validated manual board exist | Close rule boundary/input gaps and repair five-step UI semantics |
| Explain overload and deferred orders | Candidate dispositions require reasons | Durable deferral history, repeat-skip evidence, next-run carry-forward and store notice |
| Load to stop sequence; flag shortfalls before departure | `loading` module contains placeholders | Published load tasks, quantity/issue records, blocked departure and dispatcher resolution |
| Driver stops, outcomes and proof of delivery | `delivery` module contains placeholders | Driver assignment, owned trip reads, stop transitions, proof persistence and ETA |
| Offline field work and reconciliation | `sync` and `packages/field-core` contain placeholders | PWA caching, durable outbox/blobs, idempotency, retries and visible conflicts |
| Store receipt and discrepancies | `receipt` module contains placeholders | Compare recorded quantities, confirm/dispute and route issues to dispatcher |
| Visibility after departure | Live Operations is an unavailable-state layout | Progress, last update, issues, scoped events and polling fallback |
| Seed shared records and a realistic delivery day | Live API/SQL agree; idempotent seed tests pass | Rehearse the complete judge journey from a fresh isolated stack |
| Public URL and four seeded role credentials | Local Compose verified | Deployment and judge account provisioning are not evidenced here |
| GitHub monorepo named `TeamName_SolutionName` | Local monorepo exists | Confirm required remote naming and hosted CI; no push performed |
| Root Compose and `.env.example` | Present | Verify the final complete release starts using the documented command |
| README setup/configuration/accounts/numbered walkthrough/departures | Setup and account configuration present | Add a real four-role numbered walkthrough and significant design departures |
| Architecture diagram and data model in `docs/` | Reference contains diagrams and schema sketches; Designathon diagrams exist | Update them to distinguish shipped state from planned components and show the final operational model |
| AI disclosure in `docs/` | Design documentation §11 contains a design disclosure | Extend with accurate Hackathon code/test assistance and human verification |
| Unlisted demo video | No link found in reviewed release documentation | Record and supply the required five-to-eight-minute video |

Manual, assisted and automatic allocation are all permitted by booklet page 12. CP-SAT is not a general Round 2 prerequisite. Native Android is an optional addition to the required responsive web app. Trained Datathon predictions are separately judged and need not be integrated (page 15).

However, `waypoint-design-documentation.md` explicitly describes assisted generation, ten-week capacity forecasting/decisions, predicted risk, product catalogs and line-by-line receipt. These are **unresolved design commitments**, not automatically waived by the booklet's implementation choices. Establish which flows were actually in the submitted design; implement them faithfully or obtain the owner's scope decision and document significant departures. No such departure is approved by this audit. Do not invent products, coordinates, forecasts or prediction scores when their sources are absent.

## Phase 0–7 reconciliation

| Phase | Assessment | Gate treatment |
|---|---|---|
| 0 | Local foundation implemented; CI workflow exists | Keep master open: hosted CI evidence pending and current full web lint fails |
| 1 | Existing shell/token/component evidence plus passing current component tests | Retain earlier completion; new planning-screen token violations belong to the open UI gate |
| 2 | Existing RBAC/session/browser evidence; current security integration suite and four real logins pass | Retain completion; future field endpoints must enforce actual assignment ownership |
| 3 | Current real-dataset, import, fleet and PostgreSQL tests pass; live counts match SQL | Retain completion |
| 3A | Live-data screens implemented, but current planning UI violates truthfulness and server-metric rules | Keep open; reopen the affected assertions |
| 4 | Functional ordering slice supported by current tests and earlier curl/browser evidence | Mark functional phase complete; overall release still requires current design/browser sign-off |
| 5 | Complete immutable snapshot backend verified; latest five-step queue integration has defects | Keep master and affected frontend gate open; preserve backend completion |
| 6 | R1–R12 engine, calculators, shared displays and 56 passing domain tests exist | Mark implemented tasks/fixtures; keep full gate open for boundary, input and cross-trip checks |
| 7 | Functional manual board has prior isolated curl/browser evidence and current integration tests pass | Retain functional completion; this is not Phase 11 handoff or final five-step visual sign-off |

Phase completion here is the phase's specific functional gate, not a claim that every common release-definition item is finished. Earlier browser/Python-outage tests were read, not rerun in this audit. Phase 7's full release readiness remains dependent on closing Phase 6 and the affected UI gates.

## Findings that must be addressed before later planning gates

1. **Hard-coded operational copy.** `PlanningConfirmedOrdersPage.tsx` still prints “7 late orders moved to the next run.” No API value supplies that count. Remove it or supply a server-owned metric.
2. **Browser-owned business totals.** The same page totals volume and category counts from a separate request capped at 200 rows. Step 5 also computes business totals locally, with a fallback of `manifestRows.length * 15` for volume. Use backend summary values for the exact date/depot/filter/selection scope; do not infer full-set totals from a page.
3. **Exclusion/deferral controls do not perform their stated actions.** `excludedKeys` changes presentation but is not used by snapshot creation. Step 1 “Move to Deferred” only marks local exclusions and clears selection; it persists no reason, deferral or next-run record. Phase 7's candidate defer action is real, but the Step 1 action is not equivalent.
4. **Van-only filter has no query effect.** Only ambient/chilled filters become request parameters. Clicking van-only does not filter the result set. Add server-side access filtering before paging, with tests for counts and membership.
5. **Scope invalidation is incomplete.** The top-bar `scope.depot` effect changes the selected depot without invoking `clearScope`; that function also leaves `excludedKeys` intact. Verify date/depot switches cannot retain a previous snapshot, selection, candidate or exclusion set.
6. **Invented geographic positions.** `InteractiveRouteMap.tsx` uses static district coordinates, generated fallback points and per-stop offsets. `Step1MapSplitView.tsx` uses invented marker placement and local cluster counts. The technical reference explicitly states outlet coordinates are absent. Use an honestly labeled schematic built from supported backend data or an approved real coordinate source; do not portray offsets as outlet locations.
7. **Timer-driven optimization narrative.** `PlanningStep2Generate.tsx` advances percentages and “Optimizing multi-stop routes” text using timers although the current backend creates a manual candidate. A later manual-mode notice does not make these stage claims authoritative. Align progress and wording with actual work; assisted generation remains a design commitment to resolve.
8. **Publication is only the minimal manual gate.** It validates persisted assignments, reserves fuel and transitions assigned orders. It rejects a second published plan instead of superseding, creates no loading tasks or driver assignment, and sends no operational notifications. Unassigned orders are accepted when an explicit disposition reason exists, including `UNASSIGNED`; Phase 8/11 must distinguish explicit deferral from mere backlog and transition every closed order correctly.
9. **Constraint tests are substantial but incomplete.** The named-rule tests pass, including exact capacity and fuel boundaries. Exact 270/480-minute and delivery-window-close cases and cross-trip waiting need dedicated coverage. `DeliveryWindowRule` advances the next trip by `tripMinutes` without adding waiting, while the snapshot adapter adds waiting and the manual service performs another arrival check. Protect the independent validator itself; do not rely on one caller's extra check. Pure calculators/adapter also have zero fallbacks for absent inputs/fuel state; prove required inputs fail honestly. Any policy or formula change requires the owner's approval under AGENTS.md.
10. **Synthetic diagnostics are not full S1 acceptance.** `S1DiagnosticFixtureTest` constructs invented small scenarios. It does not demonstrate allocation/accounting/fairness for the complete supplied peak day or prove an optimum. Exercise the local, ignored S1 data with the final chosen allocation path; keep public test fixtures synthetic.
11. **Order representation differs from the design.** `CustomerOrder` currently stores aggregate units/weight/volume, without product lines. Loader shortfalls and the submitted line-by-line receipt need a consistent, sourced representation. Decide this before building both endpoints and screens; do not fabricate a catalog or historical order lines.

## Fresh verification on 2026-10-03

| Check | Actual result |
|---|---|
| `cd apps/api && ./gradlew test --rerun-tasks --no-daemon` | **110 passed, 0 failures/errors/skips**; real PostgreSQL Testcontainers, including **56 planning-domain tests** and OpenAPI drift |
| `corepack pnpm --dir apps/web test --maxWorkers=1 --no-file-parallelism` | **66 passed across 13 files** |
| `corepack pnpm --dir apps/web typecheck` | Passed |
| TypeScript client regenerated to `/tmp` and compared with tracked `api.d.ts` | Byte-identical; no generated files changed |
| `corepack pnpm --dir apps/web lint` | **Failed: 3 errors, 7 warnings** |
| `corepack pnpm --dir apps/web build` | Passed; existing >500 kB chunk warning |
| `apps/intelligence/.venv/bin/python -m pytest apps/intelligence/tests` | **3 passed**, one existing Starlette deprecation warning; local interpreter Python 3.13.6 |
| `docker compose ps` | API/web running; PostgreSQL/intelligence healthy; local API 8081/web 5173 |
| Read-only API/SQL comparison | Shared counts and confirmed-order/plan counts agree |
| `git diff --check` | Passed |

Lint errors: `Sidebar.tsx:72` empty catch block; `PlanningStep4Exceptions.tsx:135` and `:154` impure `Math.random()` calls during render. Hook-dependency warnings also remain. Passing Vitest/build does not override this failure.

Temporary test output is under `/tmp/waypoint-round2-*.log`. No production code, migration, contract or operational order/plan was changed. Authenticated curl checks created normal login sessions only. The API was already running; no rebuild or endpoint behavior change was made by this audit.

### Curl evidence

Actual calls used `curl -sS --max-time 15 -D <temporary-headers> -o <temporary-body> -w '%{http_code}'`, with `-b <role-cookie-jar>` for protected reads. Login used `-X POST -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary @<private-payload> -c <role-cookie-jar>`. Credentials/cookies and supplied order rows are omitted.

| Method / URL (`http://localhost:8081`) | Session | Status / real result |
|---|---|---|
| `GET /api/v1/system/health` | Anonymous | 200; `{"service":"api","status":"ok","intelligence":"reachable"}` |
| `GET /v3/api-docs` | Anonymous | 200; 36 paths; no loader/driver/sync/receipt operational paths |
| `POST /api/v1/auth/login` | Dispatcher | 200; session created |
| `POST /api/v1/auth/login` | Store manager | 200; session created |
| `POST /api/v1/auth/login` | Loader | 200; session created |
| `POST /api/v1/auth/login` | Driver | 200; session created |
| `GET /api/v1/reference/summary` | Dispatcher | 200; `{"outlets":120,"vehicles":60,"calendarDays":910,"districts":12,"serviceAllowances":9,"demoOperatingDate":"2026-06-26"}` |
| `GET /api/v1/dispatcher/dashboard?date=2026-06-26&depot=Peliyagoda` | Dispatcher | 200; confirmed 85, planned 0, planning progress 0/85; execution metrics explicitly unavailable |
| `GET /api/v1/dispatcher/orders?date=2026-06-26&depot=Peliyagoda&size=1` | Dispatcher | 200; total 85 |
| `GET /api/v1/dispatcher/plans?date=2026-06-26&depot=Peliyagoda` | Dispatcher | 200; `[]` |
| Same plan-list URL | Anonymous | 401; `UNAUTHENTICATED`, matching trace/header ID |
| Same plan-list URL | Store manager | 403; `FORBIDDEN`, matching trace/header ID |
| `GET /api/v1/dispatcher/plans/999999999` | Dispatcher | 404; `NOT_FOUND`, matching trace/header ID |
| `GET /api/v1/store/cutoff` | Store manager | 200; Asia/Colombo, cutoff 16:00, fixed demo instant `2026-06-25T11:00:00Z`, next delivery `2026-06-27` |

Read-only SQL returned outlets 120, vehicles 60, calendar days 910, districts 12, service allowances 9, confirmed Peliyagoda orders for the demo date 85, plans for that date/depot 0. Mutation/rule-rejection curls and full browser journeys were **not rerun**; prior isolated evidence is in `MANUAL_PLANNING_VERIFICATION.md` and `PHASE0_5_COMPLETION_VERIFICATION.md`.

### Figma and documentation limitations

Current MCP metadata attempts and `whoami` returned repeated authentication prompts, so no fresh Figma tree or screenshots were obtained. Do not infer access or visual fidelity from earlier reads. Earlier technical/token docs say only Dispatcher frames exist, but the design documentation links Store Home `87:6649`, Loader Home `93:7502` and Driver Home `55:5282`. Resolve that disagreement through an authenticated read and verify the actual submitted version. No token was requested, read or stored by this audit.

README's former “through Phase 5” status and the completion record's “Phase 6 next” narrative are historical. The five-step integration now consumes manual-plan APIs and dashboard progress is implemented; older manual verification accurately describes its own earlier integration state.

## Execution order and acceptance gates

1. **Close foundation/UI/constraint gaps (0, 3A, 5, 6, integrated 7).** Fix lint, server summaries/filtering, real exclusion/deferral semantics, scope reset, truthful generation/map/publication copy and tokens. Add missing boundary, absent-input and cross-trip-wait regressions without changing the booklet formula. Read the submitted Figma frames and test both planning routes. Gate: generated contract/client agree; affected tests, curl and browser journeys pass; exact snapshot membership and server metrics agree with SQL.
2. **Durable deferral/fairness (8).** Record actor, reason, rule evidence and previous-run history; carry protected orders to the next operating run; show store notice. Gate: two consecutive operating days, missing-reason rejection, retained history and store visibility pass. Candidate-local dispositions alone do not close this gate.
3. **Selected allocation mode (9).** Preserve manual independence. Because the design describes assisted generation, resolve that commitment and implement the selected assistance if retained. Validate every candidate, and test unavailable/invalid computation recovery. CP-SAT stays optional unless selected; no hard-coded solver results or claimed optimum.
4. **Explanations and operational resolution (10).** Expose why rejected/deferred, consequences and relevant valid alternatives; build dispatcher issue triage. Implement promised preview/apply behavior with no mutation during preview. Gate: fixes cannot bypass validation, and operational issues retain an accountable resolution.
5. **Operational publication/versioning (11).** Publish fully accounted orders, durable deferrals, fuel, current version, load tasks and audit atomically; notify after commit. Add supersession/stale-version behavior and prevent duplicate fuel reservation. Establish driver-to-trip assignment without treating driver availability as a new fleet constraint. Gate: failed/concurrent publish, republish and stale clients preserve records.
6. **Loader slice (12).** Build published depot trips, reverse loading sequence, recorded quantities, missing/damaged/shortfall reports, blocked completion and handoff. Gate: phone/tablet journey, depot isolation, shortfall resolution and mid-load version change pass.
7. **Driver online slice (13).** Build owned trips/stops, arrive/outcome/depart/complete, proof upload and deterministic ETA visible to stores. Gate: a real phone completes an assigned trip; other-driver resources return 404; proof and outcome match PostgreSQL. Review the planned proof-storage service before introducing a new service/deployment target.
8. **Driver PWA offline/sync (14).** Shared field core, persistent shell/trips/outbox/proof blobs, idempotent server commands, separate occurred/recorded times, retry/conflict/stale-plan UI. Gate: offline reload, two saved stops, reconnect, lost-response retry and duplicate replay apply each event exactly once without losing evidence. Native 14A remains an optional separate addition.
9. **Receipt (15) then Live Operations (16).** Implement received/short/damaged comparison with the agreed quantity/line representation, receipt confirmation/disputes and dispatcher visibility. Gate: one order is traceable across all four roles; driver updates/shortfalls/receipts appear with honest last-update and offline states; event failure has polling recovery.
10. **Retained submitted-design commitments (17–20 as applicable).** Resolve forecasts/capacity, predictions, simulations and assisted-planning scope against the actual submission. Use source-backed estimates with version/limitations; keep deterministic hard rules. Trained Datathon tasks are separate, but promised Hackathon flows need implementation or an explicitly approved, documented departure. Do not mark omitted roadmap phases complete.
11. **Hardening and full verification (21–22).** Fresh isolated Compose startup, generated artifact checks, authorization/concurrency/rollback, full S1 accounting, phone/tablet/desktop browser checks, offline and stale-plan recovery, backup/restore and hosted CI. Update README walkthrough/departures, actual architecture/data model and Hackathon AI disclosure. Gate: another person can reproduce the complete four-role workflow and failure journeys.
12. **Release deliverables.** Prepare a reviewable deployment configuration, seeded judge accounts and demo script/video. Public deployment, pushes, PRs and uploads require the owner's authorization under AGENTS.md; local preparation precedes that approval. Confirm dataset deployment rights and keep competition CSVs/secrets out of public source/artifacts.

Each slice follows **migration → Spring → generated OpenAPI/client → UI → tests → live curl/SQL → browser/design check → work log**. Use existing modules/directories. Ask before the architecture, constraint/policy, authentication, destructive, structural and outward-facing changes listed in AGENTS.md. No approval for those future changes is inferred from this analysis.


## Authorized repair follow-up — 2026-10-03

Figma access now succeeds; no token is needed. The owner authorized the existing-work merge/push, completed at `main`/`origin/main` `561ee5f`, followed by local work on `fix/planning-data-integrity`.

The first repair slice fixes the late-order count, uncapped server queue/volume metrics, server parking filtering, reasoned candidate exclusions, refresh and depot-scope invalidation, invented map locations/manifest values, simulated optimization progress and false publication success. It adds server-assigned volume and independent cross-trip-wait/window-close/budget-boundary regressions. Full lint is now clean. Fresh isolated curl, PostgreSQL and browser evidence—including manual publication with Python stopped—is recorded in [Manual Planning Verification](./MANUAL_PLANNING_VERIFICATION.md#2026-10-03--planning-integrity-follow-up).

The original findings above are a historical audit baseline. Findings 2/5/7 still need the complete screen metrics/state/copy/CSV/date-switch and visual review; finding 9 still needs input-integrity/full acceptance checks. Findings 8/10/11 and later operational/intelligence requirements remain open. Candidate DEFERRED records do not implement the durable carry-forward/fairness workflow. Keep the execution order above: finish current gates, then deferral/fairness, allocation mode, loading, operational publication, delivery/offline/receipt, remaining submitted-design capabilities, and release verification. No complete Round 2 or visual sign-off is claimed.

## Step 1 follow-up — 2026-10-03

Server-owned planning metrics: the manual-plan response now carries `availableVehicles`, `totalOrders`, `totalOrderVolumeM3`, per-trip `volumeUtilisationPct` and `stopCount`. Step 2 and Step 3 read these instead of querying vehicles or counting in the browser; unavailable values show a dash. Also fixed a utilisation bar that could receive an invalid width.

| Check | Result |
|---|---|
| `./gradlew test` (full) | 115 passed, 0 failed |
| Web typecheck / lint / tests | Clean / clean / 73 passed |
| Isolated stack curl (API 18090) | login 200; snapshot 201; create plan 201; add trip 200 with `volumeUtilisationPct` 6.25 (0.5/8.0); anonymous 401; store manager 403 with matching `X-Request-Id`/`traceId`; unknown plan 404; unknown vehicle 422; `volumeUtilisationPct` present in `/v3/api-docs` |
| SQL reconciliation | Snapshot 85 orders, 409.864 m³, 28 available vehicles; the API metrics agree |

Still open for this gate: Figma visual comparison, date-switch/error/forbidden browser journeys, input-integrity checks for absent fuel/inputs, full S1 acceptance and hosted CI. The isolated stack was removed afterwards; the main stack was rebuilt.

## Step 2 follow-up: durable deferral and fairness, 2026-10-03

- Publication now refuses any order that is neither assigned nor explicitly deferred (`ORDER_NOT_DEFERRED`). This resolves the "explicit deferral versus mere backlog" part of finding 8.
- Deferrals are append-only history with reason code, rule, evidence and decider. Orders carry forward to the next run through `planning_date`.
- Fairness is derived from that history and the imported scenario facts. Stores see and acknowledge their notices.
- Evidence: [Deferral verification](./DEFERRAL_VERIFICATION.md).
- Still open: operational publication (load tasks, driver assignment, supersession; finding 8's remaining part), a browser and Figma review of the new screens, and the Step 4 local fallback path flagged in that document.

## Step 3 follow-up: operational publication, 2026-10-03

- Publication is now the operational handoff: it replaces the current version, counts fuel once, freezes the schedule, assigns the vehicle's driver and creates load tasks in one transaction. This closes the remaining part of finding 8.
- Revisions re-plan the whole run from a copy of the published trips. A server-computed version diff feeds Step 5 and, later, the loader.
- Owner decision: quantities are per order, in units, because the data has no product lines (finding 11). This is a documented design departure.
- Evidence: [Publication verification](./PUBLICATION_VERIFICATION.md). Still open: loader and driver screens (Steps 4–5), Docker smoke and a real-dataset run.

## Step 4 follow-up: loader workflow, 2026-10-03

- The loader works on phone and tablet from the Figma Loader page. They count orders in reverse stop order, report shortfalls (missing, damaged or wrong item, optionally holding the vehicle), acknowledge a republished manifest and hand the trip over. Counts carry over across versions.
- Shortfalls reach the dispatcher before departure. A hold blocks handover until the dispatcher sends the order short or replans.
- Evidence: [Loading verification](./LOADING_VERIFICATION.md). Still open: the driver consumes the handed-over trip (Step 5), the full Exceptions page (Step 8), Docker smoke and a real-dataset run.
