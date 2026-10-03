# Exceptions queue and Live Operations: verification

Date: 2026-10-04 (Asia/Colombo). Covers Round 2 Step 8 (implementation plan Phase 16, and the exception-triage part of Phase 10). After departure the dispatcher has one queue of what needs attention and a board of every published trip. Designs: Figma Exceptions `76:6013` and Live Operations `76:5697`.

## How it works

```
loading_issue ───────┐
receipt_discrepancy ─┤  read model (nothing copied)    ┌──────────────────────────────┐
delivery_record ─────┼──────────────► ExceptionService ─┤ operational_exception        │
sync_command ────────┘   one list      per run + depot  │ (who took it, how it closed) │
                                                        └──────────────────────────────┘
delivery_trip · stop_visit · delivery_record · load_task ──► LiveBoardService ──► board (polled every 15 s)
```

- **Queue sources** (each stays with the module that owns it):
  - loading shortfalls (loading), store disputes (receipt), partial or failed deliveries and records kept with a review reason (delivery), and phone actions that conflicted, were rejected or came from a route that changed offline (sync).
  - The queue covers the chosen day and depot, plus the depot's store disputes on any day (a dispute can arrive after the delivery day).
- **Handling state:** only the small `operational_exception` table (migration `V20261004_1800`, additive). A row exists once an item is taken or closed. Taking an item shows "In Progress" under the dispatcher's name; a colleague may take over.
- **Closing an item:**
  - Loading shortfalls and store disputes need a decision and are closed through their owners (`LoadingIssueService.resolve`, `ReceiptService.resolve`), so their own rules, stale checks and order status changes still apply.
  - Delivery problems and sync flags have no workflow of their own: they are acknowledged with a note.
  - A note is always required.
- **Live board:**
  - One row per published trip: state, current stop, orders done and total, and last activity.
  - The state is LOADING, READY, IN_TRANSIT, DELAYED or COMPLETED.
  - DELAYED means a remaining stop's projected arrival falls after its window closes. The projection is the same `EtaProjector` the driver's screens use, so both show the same time.
  - "Last update" is measured against the server's snapshot time, never the browser clock.
- **Polling:** both pages and the sidebar badge refetch every 15 s. The dashboard tiles (Active trips, Trips ready, Exceptions) are now real.

## Rules and errors

| Rule | Response |
|---|---|
| Dispatcher only; depot required (own depot by default) | `403 FORBIDDEN`, `401 UNAUTHENTICATED`, `400 DEPOT_REQUIRED`, other depot's data `404` |
| Unknown type or item | `400 INVALID_TYPE`, `404 NOT_FOUND` |
| Closing needs a note, and a decision for loading and receipt items | `422 NOTE_REQUIRED`, `400 INVALID_DECISION` |
| Version checked on close | `409 STALE_EXCEPTION` (own items), `409 STALE_ISSUE` and `409 STALE_DISCREPANCY` (owner codes pass through) |
| Already closed | `409 EXCEPTION_RESOLVED` (own items and claims), `409 ISSUE_RESOLVED` and `409 DISCREPANCY_RESOLVED` (owner codes) |

Every claim and close is audited with actor, type and note.

## Automated tests

| Check | Result |
|---|---|
| `ExceptionsIT` (2) | Four kinds appear with the right facts; counts; scope (other depot, roles, 401, 400); claim moves to In Progress; each kind closed through its owner (order becomes `receipt_confirmed`, the loading issue resolved); stale, duplicate and note rules; dashboard figures; audit rows. A delivered record with a review reason appears as a review item, and a clean delivery does not |
| `LiveOperationsIT` (2) | A trip moves LOADING, READY, IN_TRANSIT, then ARRIVED, orders done, stop done and COMPLETED as the dock and the driver act; another depot and the wrong roles are refused; a trip started far too late is DELAYED with a late stop |
| `OrderQueryIT` | Dashboard tiles now available and consistent |
| Web `exceptions.test.tsx` (5), `liveOps.test.tsx` (4) | Tabs with counts, filtering, age against server time, take and decide bodies (version, decision, note), acknowledge, server error shown, empty, error and forbidden states; delayed-first list, selection, stops, filters, schematic and its caveat |
| Playwright `live-operations.spec.ts` | The dispatcher's board follows the loader and the driver without a reload (Loading, Ready to leave, In Transit, orders done); a rejected phone action becomes an exception with a menu badge, is taken and acknowledged |
| Playwright `lifecycle.spec.ts` | Updated: the dispatcher now resolves the store dispute from the Exceptions queue |

## Curl on a running API

One quiet script on the synthetic stack (65 checks, 0 mismatches: status, error `code`, `traceId` equal to `X-Request-Id`, no internals, SQL agrees). Key rows:

| Call | Status | Key result (SQL agrees) |
|---|---|---|
| `GET /dispatcher/live-operations?date&depot` | 200 | Two trips LOADING; after handover READY; after start on the road; arrived ARRIVED; orders done 1 and issues 1 match `delivery_record` |
| `GET /dispatcher/live-operations` without depot / with `depot=Kandy` | 400 `DEPOT_REQUIRED` / 200 | Empty board for the other depot |
| `GET /dispatcher/exceptions?date&depot` | 200 | 4 items (loading shortfall, partial delivery, store dispute, rejected phone action), counts 4 open |
| `GET /dispatcher/dashboard` | 200 | Exceptions 4, active trips 1, trips waiting 1 |
| `POST …/exceptions/LOADING_ISSUE/{id}/claim` | 200 | In Progress; wrong role 403; unknown id 404; bad type 400 `INVALID_TYPE` |
| `POST …/resolve` loading: no note / bad decision / stale / ok | 422 / 400 / 409 `STALE_ISSUE` / 200 | `loading_issue.status` = RESOLVED; claiming it again 409 `EXCEPTION_RESOLVED` |
| `POST …/resolve` receipt with `CREDIT` | 200 | Order `receipt_confirmed` |
| `POST …/resolve` delivery problem: stale / blank note / ok / again | 409 `STALE_EXCEPTION` / 422 / 200 / 409 | Version 1 after claim |
| `POST …/resolve` sync review, version 0 | 200 | `operational_exception`: 4 rows, all RESOLVED; 6 audit rows |
| any queue or board call: no session / store, loader, driver | 401 / 403 | Trace ids match, nothing internal |
| `GET /v3/api-docs` | 200 | All four new paths present |

`scripts/smoke.sh` repeats the read-only checks (queue and board shape and counts, 400, 401, 403 per role). It ran on the same stack with the Python service step skipped, because the Docker stack could not be built here.

## Departures and limits

- **Schematic, not a map:** the data has no coordinates, so each trip is a spoke from the depot to its district with its stops and a vehicle marker.
- **Polling, not SSE:** a change appears within 15 s. After-commit events and a depot-scoped stream remain a later upgrade.
- **No suggested fix yet:** "Apply Fix" and planning-engine exceptions need Steps 10 and 11. The detail panel shows the facts and the real decisions, plus a link to Planning.
- **Device-clock skew** is shown on the affected item ("device clock was off"), not as an item of its own, because the demo clock is fixed and would flag every phone action.
- **The earlier receipt panel** on the Exceptions page is replaced by the queue (its endpoint stays). `ReceiptDiscrepanciesPanel` is now unused; deleting the file needs the owner's approval.

