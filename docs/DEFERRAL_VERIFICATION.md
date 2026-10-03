# Deferral and fairness: policy and verification

Date: 2026-10-03 (Asia/Colombo). Covers implementation plan Phase 8.

## Policy

- **Publication closes the run.** Each closed order must either be on a trip or be explicitly deferred with a reason code and an explanation. An order left as `UNASSIGNED` is refused with `422 ORDER_NOT_DEFERRED`.
- **History is append-only.** Publishing writes one `deferral` row per deferred order. The row records the order, outlet, plan, run date, next run, reason, rule, protect/notify choices, consecutive-skip count, evidence JSON, who decided and who published. Database triggers reject `UPDATE` and `DELETE`.
- **Carry-forward.** A published deferral sets the order to `deferred` and moves `customer_order.planning_date` to the next run. The requested `order_date` never changes. The next run's queue, snapshot and dashboard include carried orders (`status IN ('confirmed','deferred')` on `planning_date`). When that run publishes, the order becomes `planned` or is deferred again.
- **Next run.** This is the date the dispatcher chooses, or by default the first operating day after the plan date. If the calendar has no later operating day, publication fails with `422 NO_OPERATING_DAY` and nothing is written.
- **Fairness is derived, never stored as a counter.** It is computed per order at read time:
  - `deferredPreviousOperatingDay`
  - `priorConsecutiveDeferrals`: unbroken skips over earlier operating days
  - `lastDeferralDate`
  - `carriedForward` and `protectedThisRun`

  These come from deferral history. The scenario CSV's `deferred_yesterday` and `days_since_last_served` are imported as source facts and labelled (`evidenceSource`: `history`, `source`, `history+source`, `none`). The imported flag extends a streak only when the history is unbroken back to the order's requested date.
- **Protect on next run** marks the carried order as first priority in the next run's fairness evidence. It does not block a second deferral; a repeat is recorded with its count.
- **Store notice.** Deferrals with `notifyStore` appear on the store's home page and order detail. Each notice shows the reason, the next run and who decided. It promises no arrival time. Acknowledgement is recorded once (`deferral_acknowledgement`, audited).
- **Delivery records do not exist yet.** So `daysSinceLastServed` comes only from imported data until the driver workflow exists.

## Reason codes (Figma defer dialog 4A+)

| Code | Label | Named rule |
|---|---|---|
| `CAPACITY` | Capacity constraint on current run | R6 `TRIP_CAPACITY` |
| `NO_REEFER` | No refrigerated vehicle available | R2 `TEMPERATURE_COMPATIBILITY` |
| `WINDOW_CONFLICT` | Store window closed during planned arrival | R8 `DELIVERY_WINDOW` |
| `VAN_ACCESS` | Van access limitation | R3 `VEHICLE_ACCESS` |
| `OTHER` | Other (explanation required) | — |

## API

| Route | Role | Purpose |
|---|---|---|
| `POST /api/v1/dispatcher/plans/{id}/orders/{orderId}/defer` | Dispatcher | Now takes `reasonCode` (required), `protectNextRun` and `notifyStore` |
| `PUT /api/v1/dispatcher/plans/{id}` | Dispatcher | Dispositions carry the same fields |
| `GET /api/v1/dispatcher/plans/{id}` | Dispatcher | Adds `fairness` per order, plus the decider on each disposition |
| `GET /api/v1/dispatcher/deferrals?date&depot` | Dispatcher | Run history with server totals (deferred, protected, repeat skips, notified, acknowledged) |
| `GET /api/v1/store/deferrals` | Store manager | Own outlet's notified deferrals |
| `POST /api/v1/store/deferrals/{id}/acknowledge` | Store manager | Idempotent; another outlet's notice returns 404 |

Migration: `V20261003_1600__deferral_history.sql`. Additive only: no column is dropped, renamed or retyped.

## Verification

**Automated:** the full API suite passes (119 tests on PostgreSQL Testcontainers). `DeferralIT` covers:
- two consecutive operating days, including a Sunday skip to Monday
- protected carry-forward
- history plus imported-source streaks
- a missing or invalid reason code
- refusal of unassigned backlog with nothing persisted
- store visibility and a single acknowledgement
- the append-only triggers
- audit events

The web suite passes 76 tests, with clean typecheck and lint. New UI tests cover the consequence panel, Deferred Orders totals and empty state, and store acknowledgement.

**Live stack:** an isolated Compose project (API 18091) ran on real demo data with the demo clock at 2026-06-25T11:00Z, then 2026-06-26T11:00Z. It was removed afterwards. Error bodies carried a `traceId` equal to `X-Request-Id`.

| Call | Status | Result |
|---|---|---|
| `POST /plans` (day one candidate) | 201 | 85 orders; fairness flags 10 source repeat skips (matches the 10 `deferred_yesterday` rows) |
| `POST .../orders/1/defer` without `reasonCode` | 400 | `REASON_CODE_REQUIRED` |
| `POST .../orders/1/defer` with `VAN_ACCESS` | 200 | disposition shows code, protect, notify, decided by |
| `POST .../publish` with undecided orders | 422 | `ORDER_ACCOUNTING`, then `ORDER_NOT_DEFERRED` with one `UNASSIGNED` |
| `POST .../publish` with all 85 deferred | 200 | published |
| `GET /dispatcher/deferrals?date=2026-06-26` | 200 | 85 deferred, 1 protected, 10 repeat skips, 1 notified; S1-000 next run 2026-06-27, rule `VEHICLE_ACCESS` |
| `GET /store/deferrals` (STM-001) | 200 | 1 notice (S1-000) |
| `POST /store/deferrals/1/acknowledge`, twice | 200, 200 | one acknowledgement row |
| acknowledge another outlet's notice / id 999999 | 404 / 404 | `NOT_FOUND` |
| anonymous `GET /store/deferrals` | 401 | `UNAUTHENTICATED` |
| store manager `GET /dispatcher/deferrals` | 403 | `FORBIDDEN` |
| `GET /dispatcher/deferrals?date=2099-01-01` / `date=not-a-date` | 404 / 400 | `NOT_FOUND` / `BAD_REQUEST` |
| `GET /dispatcher/dashboard?date=2026-06-27` | 200 | `ordersToPlan` 85 (carried) |
| `GET /dispatcher/orders?date=2026-06-27&status=confirmed,deferred` | 200 | total 85 |
| day two `POST /planning/snapshots` (2026-06-27) | 201 | 85 carried orders |
| day two `POST /plans` | 201 | S1-000 carried, protected, previous day deferred, prior streak 1; the 10 source outlets now `history+source` with streak 2 |
| day two publish (all deferred) | 422 | `NO_OPERATING_DAY`: the supplied calendar ends Sun 28 June; nothing written |

SQL matched the API in every case:
- 85 deferral rows: 1 protected, 10 with `consecutive_deferrals > 1`, 1 notified
- 85 orders `deferred` with `planning_date` 2026-06-27
- 85 `order.deferred` and 85 `deferral.recorded` audit events; 1 acknowledgement
- `UPDATE deferral` raised "Deferral history is append-only"

The day-two *publication* is proven by `DeferralIT` on the synthetic calendar. The real calendar has no operating day after 27 June, and the supplied fleet availability covers only the peak day. Neither limit was worked around.

`/v3/api-docs` lists the three new paths. `scripts/smoke.sh` gained read-only deferral checks and passes on the main stack. The main database migrated cleanly: 87 orders, `planning_date = order_date`, and source facts back-filled.

## Not yet verified

- A browser journey of the defer dialog, Deferred Orders page and store notice, and a Figma visual comparison. Figma MCP was not connected in this session.
- The Step 4 exceptions screen still contains an earlier local "mock" fallback path for when no candidate exists. It was not changed here and needs review under the no-mock rule.
