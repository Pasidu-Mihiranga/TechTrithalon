# Loader workflow: verification

Date: 2026-10-03 (Asia/Colombo). Covers Round 2 Step 4 (implementation plan Phase 12): the dock loads published trips, reports shortfalls before departure, follows a republished manifest and hands the trip to the driver. Designs: Figma Loader page `412:8555`.

## What the loader can do

- **Home** (`93:7502`, phone `365:7647`): the depot's trips for the run in departure order, with counts, capacity, progress, the next departure and open issues. All numbers come from `GET /api/v1/loader/board`.
- **Trip** (`93:7636`): stops in loading order (last stop first, one stop = consecutive orders for the same outlet), trip capacity and the next order to count. When every order is counted and nothing blocks it, **Mark trip as loaded** hands the trip over (`94:7621`).
- **Order** (`93:7810`): one line per order, in units (owner decision: the data has no product catalog). **Confirm N units loaded** records the full count.
- **Report shortfall** (`553:7136`): missing, damaged or wrong item; units short; an optional note; and whether it **holds the vehicle**. The order is recorded as loaded short, and the dispatcher sees it at once.
- **Manifest update** (`841:19967`): when the dispatcher republishes, the trip shows what changed for this vehicle (orders added, removed with units to take off, stop changes). Counts for orders that stay on the same vehicle and trip are kept, and open issues move with them. Loading and handover wait until the loader acknowledges the new version. A replaced manifest refuses writes and links to the current one.
- **Issues** (`94:7720`, `789:13121`, `789:13302`, hold `801:15378`): open and resolved shortfalls with the dispatcher's decision and next steps.
- **Profile** (`94:7860`): account and depot from the session, plus sign-out.
- **Navigation**: the Figma dark top bar (Home, Issues, Profile, depot, avatar) instead of the dispatcher sidebar. It collapses to a compact header with full-width tabs on phones.

### Dispatcher side

- `GET /api/v1/dispatcher/loading-issues` lists a run's shortfalls. `POST /{id}/resolve` records **SEND_SHORT** (leave with the available units) or **REPLANNED** (a revision handles it), with a required note. Either releases a hold.
- Step 5 (published view) shows a **Loading issues** panel with both decisions, and the manifest marks held trips.

### Rules enforced by the server

| Rule | Response |
|---|---|
| Writes carry the displayed manifest version | `409 STALE_LOAD_TASK` |
| A replaced manifest cannot be loaded | `409 MANIFEST_SUPERSEDED` with `currentTaskId` |
| Counting waits for acknowledgement of a changed manifest | `409 MANIFEST_NOT_ACKNOWLEDGED` |
| Handover needs every order counted, the manifest acknowledged and no hold | `409 HANDOVER_BLOCKED` with the reasons |
| An order is counted once; a second open shortfall is refused | `409 LINE_ALREADY_COUNTED` / `ISSUE_ALREADY_OPEN` |
| Units short between 1 and the order's units | `422 SHORT_UNITS_INVALID` |
| A handed-over trip cannot change | `409 TRIP_ALREADY_LOADED` |
| Loader sees only their depot; other depots' tasks are not found | `404 NOT_FOUND` |
| A decision is made once | `409 ISSUE_RESOLVED` |

The database also enforces that a counted line's units match its status (loaded = all units, short = fewer), that a resolved issue has a decision and a decider, and that each order line has at most one open issue.

Migration `V20261003_2200__loader_workflow.sql` is additive. Publication now copies the driver name and vehicle capacity onto the load task, because the loader cannot read fleet data and the authorization rules were left unchanged.

## Automated tests

| Check | Result |
|---|---|
| `./gradlew test` (full API, PostgreSQL Testcontainers) | **140 passed**, 0 failed (5 new in `LoaderWorkflowIT`) |
| `LoaderWorkflowIT` | Board order, capacity and counts; count then handover; stale version; held shortfall blocks handover until the dispatcher sends short; dispatcher list and plan view show the hold; a decision is made once; republish mid-load keeps the count (11 of 12), moves the open issue, refuses the old manifest with `currentTaskId`, and needs acknowledgement; 401/403/404, wrong-depot 404, invalid kind 400 |
| Web unit tests (`loader.test.tsx`, routes) | **93 passed** in total; loader tests cover Home, the empty state, load order, acknowledgement, confirm (sends `expectedVersion`), the shortfall body and consequence text, blocked handover, the replaced manifest and issue filters |
| Playwright `tests/e2e/loader.spec.ts` (synthetic stack) | Passed: publish → loader counts with a held shortfall → handover blocked → dispatcher sends short in Step 5 → handover → no overflow at 402 px |
| Web typecheck, lint, build | Clean |

## Curl on a running API

PostgreSQL in Docker with all migrations; the API on the host with the synthetic fixtures (`VEH901`, `SYN001` 12 units, `SYN002` 8 units). The migration applied cleanly on a database that already held Step 3 plans and load tasks.

| Call | Status | Key result (SQL agrees) |
|---|---|---|
| `GET /loader/board` | 200 | v1, 2 trips, 2 orders, next VEH901 trip 1 03:30, capacity 25 m³ / 5,000 kg |
| `GET /loader/load-tasks/4` | 200 | 1 stop, load position 1, blocker "1 order is not counted yet" |
| `POST …/lines/4/loaded` (`expectedVersion` 7) | 409 | `STALE_LOAD_TASK` |
| `POST …/lines/4/loaded` | 200 | loaded 12 of 12, task `loading` |
| `POST /load-tasks/4/loaded` | 200 | `loaded` |
| `POST …/lines/5/shortfall` kind `LOST` / 99 units | 400 / 422 | `VALIDATION_FAILED` / `SHORT_UNITS_INVALID` |
| `POST …/lines/5/shortfall` missing 2, hold | 200 | short 6 of 8, held |
| `POST /load-tasks/5/loaded` | 409 | `HANDOVER_BLOCKED`: "The vehicle is held until the dispatcher decides on 1 shortfall" |
| `GET /dispatcher/loading-issues?status=OPEN` | 200 | SYN002 missing 2 of 8, holds vehicle |
| `GET /dispatcher/plans/10` | 200 | trip 2 `held` true, 1 open issue |
| `POST /dispatcher/loading-issues/1/resolve` decision `IGNORE` | 400 | `VALIDATION_FAILED` |
| same with `SEND_SHORT` | 200 | resolved by the dispatcher |
| same again | 409 | `ISSUE_RESOLVED` |
| `POST /load-tasks/5/loaded` | 200 | `loaded`. SQL: both tasks `loaded`; SYN001 12/12, SYN002 short 6/8; issue `RESOLVED SEND_SHORT` |
| Republish: `POST /load-tasks/6/loaded` (old manifest) | 409 | `MANIFEST_SUPERSEDED`, `currentTaskId` 8 |
| `GET /load-tasks/7` (dropped trip) | 200 | superseded, no current task |
| `GET /load-tasks/8` | 200 | v2 replaces v1, acknowledgement required, count carried (11), issue moved to task 8 |
| `POST /load-tasks/8/loaded` | 409 | `HANDOVER_BLOCKED`: "Acknowledge manifest v2 first" |
| `POST /load-tasks/8/acknowledge`, then `/loaded` | 200, 200 | acknowledged, `loaded` |
| `GET /loader/board` anonymous / dispatcher / driver | 401 / 403 / 403 | matching trace ids, no internals |
| `GET /dispatcher/loading-issues` loader / store manager | 403 / 403 | `FORBIDDEN` |
| `GET /loader/load-tasks/999999999` | 404 | `NOT_FOUND` |
| `GET /loader/issues?status=PENDING` | 400 | `INVALID_STATUS` |
| `GET /v3/api-docs` | 200 | all 9 loader and loading-issue paths present |

`scripts/smoke.sh` now checks the loader board, the issues list and two failure paths for the loader account.

## Browser (Chromium, real API)

A full journey ran through the UI with no page errors: count trip 1 from the order screen, report a held shortfall on trip 2, see the hold on the trip, Home and Issues, decide "send short" in the dispatcher's Step 5 panel, hand both trips over. No horizontal overflow at 834 px (tablet) or 402 px (phone) on Home, Trip, Order, Issues and Profile. Screens were compared with the Figma frames listed above.

## Departures from the Figma loader frames

- **Per-order quantities, no product lines.** The order screen shows one count per order; "choose affected item" and per-product rows do not apply.
- **No barcode scanning** (`805:13516`): the data has no barcodes. Design rule: scanning is an accelerator, never required.
- **No photo upload** on a shortfall: object storage arrives with proof of delivery. The screen says so.
- **No loading bay or compartment hints** ("Bay 1", "chilled · front"): not in the data. The temperature is shown instead.
- **Outlet shown by ID and district**, not invented names like "Waypoint Fresh Colombo 07".
- **No shift label, notification bell or profile editing**: no data source yet.
- Project font (Geist) kept instead of the frames' Inter, as on the other screens.

## Not yet done

- The driver workflow consumes the handed-over trip (Step 5). Order status stays `planned` at handover and changes when the driver starts.
- Should a revision be restricted for trips already handed over? This is decided with the driver's departure in Step 5.
- The full Exceptions page for all operational issues is Step 8. Loading issues are currently decided from Step 5.
- The whole-stack Docker smoke run and a real-dataset run must happen on a machine whose network allows image builds.
