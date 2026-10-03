# Manual planning: semantics and verification

Local verification date: 2026-10-03. This work covers Phase 7 functionality. The parallel UI session's planning steps and styles were preserved.

## Prerequisite review

Read `WORK_LOG.md`, `PHASE0_5_COMPLETION_VERIFICATION.md`, the implementation plan and the related code. The Phase 6 engine exists: its 56 domain tests pass, including booklet 101/112/213 timing fixtures, named R1–R12 violations and synthetic S1 diagnostics. The complete API suite subsequently passed 110 tests against PostgreSQL, including authentication, ordering, reference data, snapshots and manual planning.

This is a functional prerequisite check, not a renewed sign-off of every earlier UI, accessibility, hosted CI or Phase 6 boundary-coverage gate. The Phase 6 master checkboxes were still unchecked when reviewed. They have not been silently marked complete.

## Candidate and publication semantics

- A candidate belongs to one immutable planning snapshot, delivery date and depot. New candidates have a monotonically increasing business `version`. Every edit requires the displayed `lockVersion` and a nonblank reason. Competing edits return `409 STALE_PLAN`; mutations are not automatically retried by the web client.
- Candidate changes are assembled separately, converted to server-owned snapshot inputs and checked by the independent validator before persistence. Clients supply IDs and sequence choices; capacities, quantities, arrival times, duration, distance, fuel and utilisation come from Spring. Delivery scheduling carries waiting into subsequent trips.
- Assignments move whole orders. Database constraints enforce one order within each plan, one stop position within each trip and at most one trip per vehicle slot (1 or 2). Different candidates may contain the same order. Vehicle and slot changes preserve trip IDs.
- Resequencing must contain exactly the existing order IDs once each. It revalidates delivery windows and returns an informational `MANUAL_SEQUENCE` warning. The audit retains the reason and before/after assignments; that informational warning is not persisted as an open exception.
- Manual deferral records the reason and optional later operating date in the candidate. Restoration returns the order to the candidate backlog. These are plan-local decisions; the persistent fairness queue, automated next-run selection and fairness enforcement belong to Phase 8.
- Publication reloads persisted assignments, checks snapshot freshness, requires all closed orders to be included and all unassigned orders to have reasons, and revalidates every hard rule. Availability and weekly fuel mutations share transaction locks. Publication, assigned-order transitions to `planned`, fuel reservations and audit events commit together. Failure rolls everything back.
- One published plan per date/depot is allowed. Published plans are immutable (`409 PLAN_LOCKED`). Supersession, cancellation, execution handoff and notification workflows remain Phase 11 and later work. Publication here makes no claim that loaders or drivers were notified.
- No manual-planning request calls Python. Missing frozen operational inputs fail explicitly; unavailable fleet vehicles cannot carry stops.

## API and UI handoff

All routes below are under `/api/v1/dispatcher/plans` and require a dispatcher session and depot access.

| Method | Route | Operation |
|---|---|---|
| POST | base | Create from `snapshotId`, with reason |
| GET | base?date=…&depot=… | List saved plans |
| GET / PUT | /{id} | Read / replace validated candidate assignments |
| POST | /{id}/trips | Add a trip |
| DELETE | /{id}/trips/{tripId} | Remove trip; retain unassignment reasons |
| POST | /{id}/moves | Assign/move/remove whole order; null target removes |
| POST | /{id}/trips/{tripId}/vehicle | Change vehicle or slot |
| POST | /{id}/trips/{tripId}/sequence | Resequence existing stops |
| POST | /{id}/orders/{orderId}/defer | Defer manually |
| POST | /{id}/orders/{orderId}/restore | Restore backlog order |
| POST | /{id}/publish | Revalidate and publish atomically |

The generated contract uses explicit `ManualPlan…Request` names to avoid collisions with reference-data `Vehicle`. `manualPlanQueries.ts` exposes typed reads and mutations, preserves rule evidence and trace IDs, and refreshes the authoritative cache only after success. The existing five-step UI can consume these hooks when the design session integrates its screens.

The functional board is `/dispatcher/manual-planning`, accessible through the dashboard's **Manual planning** link. It supports snapshot creation, saved-plan selection, trip assignment, moves, removal, resequencing, vehicle/slot changes, capacity bars, server metrics, named violations, manual deferral/restoration and publication. Loading, empty, error, forbidden and locked-plan states are implemented. Its composition uses shared controls and existing styles; it has no supplied Figma frame and remains flagged for design review. The other session's Step 1–5 UI is not declared fully integrated by this work.

Dashboard `ordersPlanned` and progress still use the earlier unavailable-state contract; plan metrics on this board are authoritative. These dashboard integrations can be made separately without changing the planning gate.

## Automated verification

Commands executed:

```bash
cd apps/api
./gradlew test --tests '*planning.domain.*'                 # 56 passed
./gradlew test                                            # 110 passed on final run
./gradlew test --tests '*ReferenceSeedIT' --tests '*OpenApiContractTest' -PupdateOpenApi
cd ../..
corepack pnpm --dir apps/web generate:api
corepack pnpm --dir apps/web typecheck
corepack pnpm --dir apps/web test --maxWorkers=1 --no-file-parallelism  # 66 passed
corepack pnpm --dir apps/web build                         # passed
bash -n scripts/smoke.sh
git diff --check
```

Focused lint of the new board/hooks/browser test and changed route/dashboard files passed. The seed cleanup test was updated to truncate the added plan tables in the test database. The initial full backend run failed only that cleanup test; the corrected final full run passed. The first concurrent web run hit two five-second timeouts; both passed with the complete single-worker rerun, without changing their timeout limits.

The Playwright manual-planning test passed against a second fresh synthetic stack (API 18083, web 15175) with Python stopped: login → candidate creation → trip assignment → rejected mixed-brand move with unchanged persisted state → deferral → publication → reload/locked state. It checked one planned order and a 4 L weekly reservation through the API. The first attempt stopped before candidate creation because the test tried to change a workspace-locked depot selector; correcting that test assumption produced the passing run. Run this test only with `MANUAL_PLANNING_FIXTURE=synthetic` and a fresh isolated database; it intentionally skips normal competition-data runs.

`ManualPlanIT` includes valid creation/editing, whole-order/two-trip rejection, no-write failures, competing updates, plan-scoped uniqueness, role/scope denial, stale snapshots, persisted-plan corruption, ignored client-supplied metrics, stable trip IDs and publication audit-failure rollback of plan/order/fuel state.
Null members in replacement trip/disposition arrays are rejected as malformed input before the service runs.
The final focused rerun of all seven manual-plan integration tests and the OpenAPI test passed after adding that guard.

The updated smoke script passed on the isolated synthetic stack: reference data, four role sessions, revocation, trace/error shape, snapshot membership, candidate persistence and rejected unexplained publication. It does not publish operational plans.

## Running-stack verification

Built an isolated Compose project with the existing service definitions, PostgreSQL and the invented fixtures under test resources. The API ran at `http://localhost:18082`; the main project database and parallel session's API were not modified. Rebuilt the API after correcting request-schema names.

Every recorded failure was checked for a stable `code`, a `traceId` equal to `X-Request-Id`, and absence of SQL/class/stack-trace leakage. Rejected assignments were followed by GET equality checks. The `/v3/api-docs` response contains the new paths and distinct request schemas; the committed contract drift test passed.

Python was stopped in the isolated project before successful curl publication. Read-only `psql` then confirmed:

| Persisted value | Observed |
|---|---|
| Plan 1 | published, business version 1, lockVersion 15, one stop |
| SYN002 | planned, order version 1 |
| SYN001 | confirmed, explicitly DEFERRED in plan 1 until 2026-06-27 |
| VEH901 weekly ledger | 4.00 L committed; 0.00 L actual |
| Publication audit | one plan.published, one order.planned, one vehicle.fuel.reserved |

The rejected attempts produced no extra publication or fuel-reservation audit entries. An empty second candidate made by smoke verification remains a candidate.

Curl evidence follows; all names and quantities are invented fixtures. Authentication bodies and session cookies are intentionally excluded.

### Curl commands and real outcomes

The commands used `-D headers -o response.json` to capture the HTTP status and trace headers. `$COOKIE_JAR` denotes the authenticated temporary cookie file.

```bash
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$COOKIE_JAR" http://localhost:18082/api/v1/system/health
# HTTP 200
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$COOKIE_JAR" http://localhost:18082/api/v1/reference/summary
# HTTP 200
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$COOKIE_JAR" 'http://localhost:18082/api/v1/dispatcher/orders?date=2026-06-26&depot=Peliyagoda&size=200'
# HTTP 200
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$COOKIE_JAR" 'http://localhost:18082/api/v1/dispatcher/fleet?date=2026-06-26&depot=Peliyagoda'
# HTTP 200 JSON list
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"planDate":"2026-06-26","depot":"Peliyagoda"}' http://localhost:18082/api/v1/dispatcher/planning/snapshots
# HTTP 201
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"snapshotId":1,"reason":"Synthetic manual verification"}' http://localhost:18082/api/v1/dispatcher/plans
# HTTP 201  {'id': 1, 'status': 'candidate', 'lockVersion': 0}
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$COOKIE_JAR" http://localhost:18082/api/v1/dispatcher/plans/1
# HTTP 200  {'id': 1, 'status': 'candidate', 'lockVersion': 0}
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$COOKIE_JAR" 'http://localhost:18082/api/v1/dispatcher/plans?date=2026-06-26&depot=Peliyagoda'
# HTTP 200 JSON list
curl -sS -D headers -o response.json -w '%{http_code}' -X GET http://localhost:18082/api/v1/dispatcher/plans/1
# HTTP 401 UNAUTHENTICATED
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$STORE_COOKIE_JAR" http://localhost:18082/api/v1/dispatcher/plans/1
# HTTP 403 FORBIDDEN
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$COOKIE_JAR" http://localhost:18082/api/v1/dispatcher/plans/999999999
# HTTP 404 NOT_FOUND
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"snapshotId":1,"reason":""}' http://localhost:18082/api/v1/dispatcher/plans
# HTTP 400 VALIDATION_FAILED ['reason']
curl -sS -D headers -o response.json -w '%{http_code}' -X PUT -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":0,"reason":"Synthetic manual verification","trips":[],"dispositions":[]}' http://localhost:18082/api/v1/dispatcher/plans/1
# HTTP 200  {'id': 1, 'status': 'candidate', 'lockVersion': 1}
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":1,"reason":"Synthetic manual verification","trip":{"vehicleId":"VEH901","tripIndex":1,"brand":"Style","district":"Alpha","orderIds":[]}}' http://localhost:18082/api/v1/dispatcher/plans/1/trips
# HTTP 200  {'id': 1, 'status': 'candidate', 'lockVersion': 2}
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":2,"reason":"Synthetic manual verification","orderId":2,"toTripId":1}' http://localhost:18082/api/v1/dispatcher/plans/1/moves
# HTTP 200  {'id': 1, 'status': 'candidate', 'lockVersion': 3}
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":3,"reason":"Synthetic manual verification","orderId":1,"toTripId":1}' http://localhost:18082/api/v1/dispatcher/plans/1/moves
# HTTP 422 PLAN_INFEASIBLE ['SAME_BRAND_DISTRICT', 'VEHICLE_ACCESS', 'DELIVERY_WINDOW', 'DELIVERY_WINDOW']
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$COOKIE_JAR" http://localhost:18082/api/v1/dispatcher/plans/1
# HTTP 200  {'id': 1, 'status': 'candidate', 'lockVersion': 3}
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":3,"reason":"Synthetic manual verification"}' http://localhost:18082/api/v1/dispatcher/plans/1/publish
# HTTP 422 ORDER_ACCOUNTING
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":0,"reason":"Stale edit","orderId":2,"fromTripId":1}' http://localhost:18082/api/v1/dispatcher/plans/1/moves
# HTTP 409 STALE_PLAN
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":3,"reason":"Synthetic manual verification","orderIds":[2]}' http://localhost:18082/api/v1/dispatcher/plans/1/trips/1/sequence
# HTTP 200  {'id': 1, 'status': 'candidate', 'lockVersion': 4}
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":4,"reason":"Synthetic manual verification","orderIds":[]}' http://localhost:18082/api/v1/dispatcher/plans/1/trips/1/sequence
# HTTP 400 INVALID_SEQUENCE
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":4,"reason":"Synthetic manual verification","vehicleId":"VEH901","tripIndex":2}' http://localhost:18082/api/v1/dispatcher/plans/1/trips/1/vehicle
# HTTP 200  {'id': 1, 'status': 'candidate', 'lockVersion': 5}
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":5,"reason":"Synthetic manual verification","vehicleId":"VEH901","tripIndex":1}' http://localhost:18082/api/v1/dispatcher/plans/1/trips/1/vehicle
# HTTP 200  {'id': 1, 'status': 'candidate', 'lockVersion': 6}
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":6,"reason":"Synthetic manual verification","trip":{"vehicleId":"VEH901","tripIndex":2,"brand":"Fresh","district":"Alpha","orderIds":[]}}' http://localhost:18082/api/v1/dispatcher/plans/1/trips
# HTTP 200  {'id': 1, 'status': 'candidate', 'lockVersion': 7}
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":7,"reason":"Synthetic manual verification","orderId":2,"fromTripId":1,"toTripId":2}' http://localhost:18082/api/v1/dispatcher/plans/1/moves
# HTTP 422 PLAN_INFEASIBLE ['SAME_BRAND_DISTRICT']
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":7,"reason":"Synthetic manual verification","orderId":1,"toTripId":2}' http://localhost:18082/api/v1/dispatcher/plans/1/moves
# HTTP 422 PLAN_INFEASIBLE ['VEHICLE_ACCESS', 'DELIVERY_WINDOW', 'DELIVERY_WINDOW']
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":7,"reason":"Synthetic manual verification","orderId":2,"fromTripId":1}' http://localhost:18082/api/v1/dispatcher/plans/1/moves
# HTTP 200  {'id': 1, 'status': 'candidate', 'lockVersion': 8}
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":8,"reason":"Synthetic manual verification","orderId":2,"toTripId":1}' http://localhost:18082/api/v1/dispatcher/plans/1/moves
# HTTP 200  {'id': 1, 'status': 'candidate', 'lockVersion': 9}
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":9,"reason":"Synthetic manual verification","nextDeliveryDate":"2026-06-27"}' http://localhost:18082/api/v1/dispatcher/plans/1/orders/1/defer
# HTTP 200  {'id': 1, 'status': 'candidate', 'lockVersion': 10}
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":10,"reason":"Synthetic manual verification"}' http://localhost:18082/api/v1/dispatcher/plans/1/orders/1/restore
# HTTP 200  {'id': 1, 'status': 'candidate', 'lockVersion': 11}
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":11,"reason":"Synthetic manual verification","nextDeliveryDate":"2026-06-27"}' http://localhost:18082/api/v1/dispatcher/plans/1/orders/1/defer
# HTTP 200  {'id': 1, 'status': 'candidate', 'lockVersion': 12}
curl -sS -D headers -o response.json -w '%{http_code}' -X DELETE -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":12,"reason":"Synthetic manual verification"}' http://localhost:18082/api/v1/dispatcher/plans/1/trips/2
# HTTP 200  {'id': 1, 'status': 'candidate', 'lockVersion': 13}
curl -sS -D headers -o response.json -w '%{http_code}' -X PUT -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":13,"reason":"Synthetic manual verification","trips":[{"id":1,"vehicleId":"VEH901","tripIndex":1,"brand":"Style","district":"Alpha","orderIds":[2]}],"dispositions":[{"orderId":1,"code":"DEFERRED","reason":"Synthetic manual verification","nextDeliveryDate":"2026-06-27"}]}' http://localhost:18082/api/v1/dispatcher/plans/1
# HTTP 200  {'id': 1, 'status': 'candidate', 'lockVersion': 14}
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$COOKIE_JAR" http://localhost:18082/api/v1/system/health
# HTTP 200
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":14,"reason":"Synthetic outage publication"}' http://localhost:18082/api/v1/dispatcher/plans/1/publish
# HTTP 200  {'id': 1, 'status': 'published', 'lockVersion': 15}
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$COOKIE_JAR" http://localhost:18082/api/v1/dispatcher/plans/1
# HTTP 200  {'id': 1, 'status': 'published', 'lockVersion': 15}
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":14,"reason":"Synthetic outage publication"}' http://localhost:18082/api/v1/dispatcher/plans/1/publish
# HTTP 409 PLAN_LOCKED
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Locked edit","orderId":2}' http://localhost:18082/api/v1/dispatcher/plans/1/moves
# HTTP 409 PLAN_LOCKED
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"snapshotId":1,"reason":"Stale snapshot"}' http://localhost:18082/api/v1/dispatcher/plans
# HTTP 409 SNAPSHOT_CHANGED
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$COOKIE_JAR" http://localhost:18082/api/v1/dispatcher/orders/2
# HTTP 200
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$COOKIE_JAR" 'http://localhost:18082/api/v1/dispatcher/vehicles/VEH901/fuel?date=2026-06-26'
# HTTP 200
```

### Real response excerpts

Excerpts are from the captured responses; omitted fields are not shown.

```json
[
  {
    "plan": {
      "id": 1,
      "snapshotId": 1,
      "planDate": "2026-06-26",
      "depot": "Peliyagoda",
      "version": 1,
      "status": "published",
      "lockVersion": 15,
      "createdBy": 1,
      "createdAt": "2026-06-25T11:00:00Z",
      "updatedAt": "2026-06-25T11:00:00Z",
      "publishedBy": 1,
      "publishedAt": "2026-06-25T11:00:00Z",
      "trips": [
        {
          "id": 1,
          "vehicleId": "VEH901",
          "tripIndex": 1,
          "brand": "Style",
          "district": "Alpha",
          "orderIds": [
            2
          ]
        }
      ],
      "dispositions": [
        {
          "orderId": 1,
          "code": "DEFERRED",
          "reason": "Synthetic manual verification",
          "nextDeliveryDate": "2026-06-27"
        }
      ]
    },
    "validation": {
      "violations": [],
      "feasible": true,
      "metrics": {
        "ordersAssigned": 1,
        "ordersUnassigned": 1,
        "vehiclesUsed": 1,
        "tripsUsed": 1,
        "totalDistanceKm": 20.0,
        "totalFuelLitres": 4.0,
        "avgVolumeUtilisation": 2.56,
        "avgWeightUtilisation": 1.92,
        "hardViolationCount": 0
      }
    },
    "unassignedOrders": [
      {
        "order": {
          "id": 1,
          "orderRef": "SYN001",
          "outletId": "OUT901",
          "brand": "Fresh",
          "temp": "chilled",
          "volumeM3": 1.25,
          "weightKg": 240.5,
          "district": "Alpha",
          "depot": "Peliyagoda",
          "dockType": "street",
          "parkingConstraint": "van_only",
          "effectiveWindowOpen": "05:00:00",
          "effectiveWindowClose": "07:30:00"
        },
        "disposition": "DEFERRED",
        "reason": "Synthetic manual verification",
        "nextDeliveryDate": "2026-06-27"
      }
    ]
  },
  {
    "type": "about:blank",
    "title": "Unprocessable Entity",
    "status": 422,
    "detail": "The edit violates planning constraints; nothing was saved",
    "instance": "/api/v1/dispatcher/plans/1/moves",
    "code": "PLAN_INFEASIBLE",
    "traceId": "eb8df1aa-29c1-4e24-a79b-2574e4748d55",
    "metrics": {
      "ordersAssigned": 2,
      "ordersUnassigned": 0,
      "vehiclesUsed": 1,
      "tripsUsed": 1,
      "totalDistanceKm": 23.0,
      "totalFuelLitres": 4.6,
      "avgVolumeUtilisation": 7.56,
      "avgWeightUtilisation": 6.73,
      "hardViolationCount": 4
    },
    "violations": [
      {
        "ruleCode": "SAME_BRAND_DISTRICT",
        "severity": "HARD",
        "scope": "TRIP",
        "entityType": "TRIP",
        "entityId": "1",
        "message": "Trip 1 (brand Style) cannot contain order SYN001 of brand Fresh.",
        "actualValue": "Fresh",
        "allowedValue": "Style",
        "remediationCode": "SPLIT_BY_BRAND",
        "evidence": {
          "actualBrand": "Fresh",
          "tripId": 1,
          "expectedBrand": "Style",
          "orderRef": "SYN001"
        }
      },
      {
        "ruleCode": "VEHICLE_ACCESS",
        "severity": "HARD",
        "scope": "ORDER_VEHICLE",
        "entityType": "ORDER",
        "entityId": "SYN001",
        "message": "Outlet for order SYN001 requires van-only access, but vehicle VEH901 is a truck.",
        "actualValue": "truck",
        "allowedValue": "van",
        "remediationCode": "NEEDS_VAN",
        "evidence": {
          "vehicleType": "truck",
          "vehicleId": "VEH901",
          "parkingConstraint": "van_only",
          "orderRef": "SYN001"
        }
      },
      {
        "ruleCode": "DELIVERY_WINDOW",
        "severity": "HARD",
        "scope": "TRIP",
        "entityType": "ORDER",
        "entityId": "SYN001",
        "message": "Order SYN001 planned arrival 10:39 is after effective window close 07:30.",
        "actualValue": "10:39",
        "allowedValue": "07:30",
        "remediationCode": "WINDOW_LATE",
        "evidence": {
          "plannedArrival": "10:39",
          "waitMinutes": 0,
          "effectiveWindowClose": "07:30",
          "orderRef": "SYN001",
          "tripId": 1
        }
      },
      {
        "ruleCode": "DELIVERY_WINDOW",
        "severity": "HARD",
        "scope": "TRIP",
        "entityType": "ORDER",
        "entityId": "SYN001",
        "message": "Waiting on earlier stops makes this delivery late",
        "actualValue": "10:39",
        "allowedValue": "07:30",
        "remediationCode": "RESEQUENCE_OR_DEFER",
        "evidence": {
          "orderId": 1
        }
      }
    ]
  }
]
```

### Every-route security and unknown-plan checks

Every route was also checked independently for missing session and wrong role; plan-specific routes were checked for unknown plan IDs. Each failure had matching response/header trace IDs.

```bash
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"snapshotId":1,"reason":"Synthetic guard verification"}' http://localhost:18082/api/v1/dispatcher/plans
# HTTP 401 UNAUTHENTICATED
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$STORE_COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"snapshotId":1,"reason":"Synthetic guard verification"}' http://localhost:18082/api/v1/dispatcher/plans
# HTTP 403 FORBIDDEN
curl -sS -D headers -o response.json -w '%{http_code}' -X GET 'http://localhost:18082/api/v1/dispatcher/plans?date=2026-06-26&depot=Peliyagoda'
# HTTP 401 UNAUTHENTICATED
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$STORE_COOKIE_JAR" 'http://localhost:18082/api/v1/dispatcher/plans?date=2026-06-26&depot=Peliyagoda'
# HTTP 403 FORBIDDEN
curl -sS -D headers -o response.json -w '%{http_code}' -X GET http://localhost:18082/api/v1/dispatcher/plans/1
# HTTP 401 UNAUTHENTICATED
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$STORE_COOKIE_JAR" http://localhost:18082/api/v1/dispatcher/plans/1
# HTTP 403 FORBIDDEN
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$COOKIE_JAR" http://localhost:18082/api/v1/dispatcher/plans/999999999
# HTTP 404 NOT_FOUND
curl -sS -D headers -o response.json -w '%{http_code}' -X PUT -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification","trips":[],"dispositions":[]}' http://localhost:18082/api/v1/dispatcher/plans/1
# HTTP 401 UNAUTHENTICATED
curl -sS -D headers -o response.json -w '%{http_code}' -X PUT -b "$STORE_COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification","trips":[],"dispositions":[]}' http://localhost:18082/api/v1/dispatcher/plans/1
# HTTP 403 FORBIDDEN
curl -sS -D headers -o response.json -w '%{http_code}' -X PUT -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification","trips":[],"dispositions":[]}' http://localhost:18082/api/v1/dispatcher/plans/999999999
# HTTP 404 NOT_FOUND
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification","trip":{"vehicleId":"VEH901","tripIndex":1,"brand":"Style","district":"Alpha","orderIds":[]}}' http://localhost:18082/api/v1/dispatcher/plans/1/trips
# HTTP 401 UNAUTHENTICATED
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$STORE_COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification","trip":{"vehicleId":"VEH901","tripIndex":1,"brand":"Style","district":"Alpha","orderIds":[]}}' http://localhost:18082/api/v1/dispatcher/plans/1/trips
# HTTP 403 FORBIDDEN
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification","trip":{"vehicleId":"VEH901","tripIndex":1,"brand":"Style","district":"Alpha","orderIds":[]}}' http://localhost:18082/api/v1/dispatcher/plans/999999999/trips
# HTTP 404 NOT_FOUND
curl -sS -D headers -o response.json -w '%{http_code}' -X DELETE -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification"}' http://localhost:18082/api/v1/dispatcher/plans/1/trips/1
# HTTP 401 UNAUTHENTICATED
curl -sS -D headers -o response.json -w '%{http_code}' -X DELETE -b "$STORE_COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification"}' http://localhost:18082/api/v1/dispatcher/plans/1/trips/1
# HTTP 403 FORBIDDEN
curl -sS -D headers -o response.json -w '%{http_code}' -X DELETE -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification"}' http://localhost:18082/api/v1/dispatcher/plans/999999999/trips/1
# HTTP 404 NOT_FOUND
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification","orderId":1}' http://localhost:18082/api/v1/dispatcher/plans/1/moves
# HTTP 401 UNAUTHENTICATED
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$STORE_COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification","orderId":1}' http://localhost:18082/api/v1/dispatcher/plans/1/moves
# HTTP 403 FORBIDDEN
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification","orderId":1}' http://localhost:18082/api/v1/dispatcher/plans/999999999/moves
# HTTP 404 NOT_FOUND
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification","vehicleId":"VEH901","tripIndex":1}' http://localhost:18082/api/v1/dispatcher/plans/1/trips/1/vehicle
# HTTP 401 UNAUTHENTICATED
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$STORE_COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification","vehicleId":"VEH901","tripIndex":1}' http://localhost:18082/api/v1/dispatcher/plans/1/trips/1/vehicle
# HTTP 403 FORBIDDEN
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification","vehicleId":"VEH901","tripIndex":1}' http://localhost:18082/api/v1/dispatcher/plans/999999999/trips/1/vehicle
# HTTP 404 NOT_FOUND
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification","orderIds":[]}' http://localhost:18082/api/v1/dispatcher/plans/1/trips/1/sequence
# HTTP 401 UNAUTHENTICATED
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$STORE_COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification","orderIds":[]}' http://localhost:18082/api/v1/dispatcher/plans/1/trips/1/sequence
# HTTP 403 FORBIDDEN
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification","orderIds":[]}' http://localhost:18082/api/v1/dispatcher/plans/999999999/trips/1/sequence
# HTTP 404 NOT_FOUND
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification"}' http://localhost:18082/api/v1/dispatcher/plans/1/orders/1/defer
# HTTP 401 UNAUTHENTICATED
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$STORE_COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification"}' http://localhost:18082/api/v1/dispatcher/plans/1/orders/1/defer
# HTTP 403 FORBIDDEN
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification"}' http://localhost:18082/api/v1/dispatcher/plans/999999999/orders/1/defer
# HTTP 404 NOT_FOUND
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification"}' http://localhost:18082/api/v1/dispatcher/plans/1/orders/1/restore
# HTTP 401 UNAUTHENTICATED
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$STORE_COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification"}' http://localhost:18082/api/v1/dispatcher/plans/1/orders/1/restore
# HTTP 403 FORBIDDEN
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification"}' http://localhost:18082/api/v1/dispatcher/plans/999999999/orders/1/restore
# HTTP 404 NOT_FOUND
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification"}' http://localhost:18082/api/v1/dispatcher/plans/1/publish
# HTTP 401 UNAUTHENTICATED
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$STORE_COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification"}' http://localhost:18082/api/v1/dispatcher/plans/1/publish
# HTTP 403 FORBIDDEN
curl -sS -D headers -o response.json -w '%{http_code}' -X POST -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":15,"reason":"Synthetic guard verification"}' http://localhost:18082/api/v1/dispatcher/plans/999999999/publish
# HTTP 404 NOT_FOUND
```

### Final malformed-input checks after rebuild

The final API image rebuilt successfully. Both null-entry requests below returned 400 before service execution, with matching trace IDs. The final OpenAPI drift check also passed. There are 77 recorded curl outcomes in total.

```bash
curl -sS -D headers -o response.json -w '%{http_code}' -X PUT -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":0,"reason":"Synthetic malformed input","trips":[null],"dispositions":[]}' http://localhost:18082/api/v1/dispatcher/plans/2
# HTTP 400 VALIDATION_FAILED
curl -sS -D headers -o response.json -w '%{http_code}' -X PUT -b "$COOKIE_JAR" -H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary '{"expectedVersion":0,"reason":"Synthetic malformed input","trips":[],"dispositions":[null]}' http://localhost:18082/api/v1/dispatcher/plans/2
# HTTP 400 VALIDATION_FAILED
```


## 2026-10-03 — Planning integrity follow-up

The owner authorized merging and pushing the existing work. `main` and `origin/main` both point to `561ee5f`; new fixes are local on `fix/planning-data-integrity`. Figma access now works: Dispatcher metadata `412:8554` and Confirmed Orders context/screenshot `21:598` were read. No Figma write or complete visual sign-off was performed.

Implemented complete server-owned confirmed-queue counts/volume, parking filtering before pagination, and server-owned assigned plan volume. Step 1 exclusions now require reasons and are persisted as candidate DEFERRED dispositions; generation retains every closed order in an all-order snapshot. Restoring exclusions returns orders to the backlog. Failed saves retain their previous state. Candidate readiness follows saved data after refresh; depot changes clear plan/step URL state, and obsolete snapshot/create responses cannot restore a previous scope.

Removed the invented late-order count, map coordinates, loading-bay/departure values, volume fallback, timer-driven optimization stages and editable controls that did not affect backend rules. Manual-allocation wording now matches the implementation. Notification delivery remains unavailable and its controls are disabled. The independent delivery-window rule carries waiting time into the next trip, without changing the prescribed trip-time or fuel formula.

Verification used a separate Compose project `waypoint-planning-fixes`, API `18084`, web `15176`, PostgreSQL `15434`, and Python `18004`, with only invented reference/demo test fixtures and private temporary credentials. No competition-data mutation was needed. Initial fixture SQL, browser readiness/refresh/scope failures, and the obsolete smoke expectation were corrected; final results follow.

- Full PostgreSQL Testcontainers API suite: **114 tests passed**. The subsequently added exact 270/480-minute plus-one boundary test and the OpenAPI drift check also passed in the focused run. Cross-trip waiting and arrival exactly at window close pass. Required-input fallback and full S1 acceptance remain open.
- Final web suite: **71 tests passed** across 13 files; full lint passed with **zero warnings/errors**, TypeScript passed, and the final Docker production build passed. Hosted CI has not been verified for these local changes.
- Permanent smoke passed against the isolated stack. It now checks queue totals, van filtering, malformed-filter errors and actual persisted dashboard counts, and accepts an explicit `SMOKE_ENV_FILE`.
- Primary browser regression passed: real van filter membership, required deferral reason/date, full snapshot accounting, persistence after reload, asynchronously loaded candidate readiness, and clearing candidate/step/deferrals on depot switches.
- Existing manual-board browser regression passed with Python stopped: assign, reject invalid move without writes, defer, publish, reload and locked-plan behavior. Python was restored afterward.
- Before publication, SQL matched the queue response: two confirmed orders, 1.890 m³, one ambient, one chilled, one van-only. After publication, SQL showed one planned order, one confirmed explicitly deferred order, one published plan and VEH901 fuel reservation **4.00 L**, actual **0.00 L**. DEFERRED reason/date remained persisted for 2026-06-27.

### Curl commands and real responses

All requests below used `curl -sS -D headers -o response.json -w '%{http_code}'`, with an explicit method. Authenticated requests used a private `$COOKIE_JAR`; mutations added `-H 'Content-Type: application/json' -H 'X-Requested-With: Waypoint' --data-binary @request.json`. Payloads were temporary JSON files, never committed. Three fixture logins returned 200; credentials/cookies are omitted. Every failed response had a stable `code`, matching `traceId`/`X-Request-Id`, and no SQL/class/stack trace leakage. The scoped fixture dispatcher belongs to Kandy; requests for Peliyagoda return 404.

| Method and URL (base `http://localhost:18084`) | HTTP | Real response excerpt |
|---|---|---|
| `GET /api/v1/dispatcher/orders/summary?date=2026-06-26&depot=Peliyagoda` | 404 | `{"code":"NOT_FOUND","traceId":"7bb7b7e5-2c98-450c-9850-d91b1957785d"}` |
| `GET /api/v1/dispatcher/orders?date=2026-06-26&depot=Peliyagoda&parkingConstraint=van_only` | 404 | `{"code":"NOT_FOUND","traceId":"05d2120f-d1e1-4a89-b319-7763e8a1e07d"}` |
| `GET /api/v1/dispatcher/orders/summary?date=2026-06-26&depot=Peliyagoda` | 200 | `{"totalOrders":2,"ambientOrders":1,"chilledOrders":1,"vanOnlyOrders":1,"totalVolumeM3":1.89}` |
| `GET /api/v1/dispatcher/orders/summary?date=2026-06-26&depot=Peliyagoda` | 401 | `{"code":"UNAUTHENTICATED","traceId":"6717b041-6568-41dc-93e2-110404eac6d0"}` |
| `GET /api/v1/dispatcher/orders/summary?date=2026-06-26&depot=Peliyagoda` | 403 | `{"code":"FORBIDDEN","traceId":"fb65b051-984f-4088-ab59-f8beb57d1374"}` |
| `GET /api/v1/dispatcher/orders/summary?date=2026-06-26&depot=UNKNOWN` | 404 | `{"code":"NOT_FOUND","traceId":"5da2f272-98b6-450c-b508-02c28d716096"}` |
| `GET /api/v1/dispatcher/orders/summary?date=invalid&depot=Peliyagoda` | 400 | `{"code":"BAD_REQUEST","traceId":"2dae580c-1f51-4e84-9275-a3e72ad61722"}` |
| `GET /api/v1/dispatcher/orders/summary?date=2026-06-26&depot=Kandy` | 200 | `{"totalOrders":0,"ambientOrders":0,"chilledOrders":0,"vanOnlyOrders":0,"totalVolumeM3":0}` |
| `GET /api/v1/dispatcher/orders?date=2026-06-26&depot=Peliyagoda&status=confirmed&size=1` | 200 | `{"total":2,"refs":["SYN001"]}` |
| `GET /api/v1/dispatcher/orders?date=2026-06-26&depot=Peliyagoda&parkingConstraint=van_only` | 200 | `{"total":1,"refs":["SYN001"]}` |
| `GET /api/v1/dispatcher/orders?parkingConstraint=invalid` | 400 | `{"code":"INVALID_FILTER","traceId":"c1984e43-4d4e-44b2-84e9-e91775c2eec4"}` |
| `GET /api/v1/dispatcher/orders?parkingConstraint=van_only` | 401 | `{"code":"UNAUTHENTICATED","traceId":"e9ef459e-b7ae-41f8-bc05-b52bd04826b0"}` |
| `GET /api/v1/dispatcher/orders?parkingConstraint=van_only` | 403 | `{"code":"FORBIDDEN","traceId":"6245ed09-0538-46b2-9e2b-ed6bc48583b4"}` |
| `GET /v3/api-docs` | 200 | `summary, parkingConstraint, assignedVolumeM3 present` |
| `GET /api/v1/dispatcher/orders?date=2026-06-26&depot=Peliyagoda&status=confirmed` | 200 | `{"total":2,"refs":["SYN001","SYN002"]}` |
| `POST /api/v1/dispatcher/planning/snapshots` | 201 | `{"id":7,"orderCount":2,"selectionMode":"all"}` |
| `POST /api/v1/dispatcher/plans` | 201 | `{"id":7,"status":"candidate","lockVersion":0,"assignedVolumeM3":0}` |
| `POST /api/v1/dispatcher/plans/7/trips` | 422 | `{"code":"PLAN_INFEASIBLE","traceId":"8e6906bf-6fa1-4fec-b4e2-8a06d146bf2d"}` |
| `POST /api/v1/dispatcher/plans/7/trips` | 200 | `{"id":7,"status":"candidate","lockVersion":1,"assignedVolumeM3":0.64}` |
| `PUT /api/v1/dispatcher/plans/7` | 200 | `{"id":7,"status":"candidate","lockVersion":2,"assignedVolumeM3":0}` |
| `GET /api/v1/dispatcher/plans/7` | 200 | `{"id":7,"status":"candidate","lockVersion":2,"assignedVolumeM3":0}` |
| `PUT /api/v1/dispatcher/plans/7` | 409 | `{"code":"STALE_PLAN","traceId":"ada25670-1b2f-4730-ade5-ad9d0dfd88ca"}` |
| `POST /api/v1/dispatcher/plans/7/publish` | 422 | `{"code":"ORDER_ACCOUNTING","traceId":"f5bfc296-d715-4632-afb5-72d319b2bb7e"}` |

Examples of the same capture format (temporary payload and cookie paths vary):

```bash
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$COOKIE_JAR" 'http://localhost:18084/api/v1/dispatcher/orders/summary?date=2026-06-26&depot=Peliyagoda'
# 200 {"totalOrders":2,"ambientOrders":1,"chilledOrders":1,"vanOnlyOrders":1,"totalVolumeM3":1.890}
curl -sS -D headers -o response.json -w '%{http_code}' -X GET -b "$COOKIE_JAR" 'http://localhost:18084/api/v1/dispatcher/orders?parkingConstraint=invalid'
# 400 {"code":"INVALID_FILTER","traceId":"...",...}; trace matches captured header
```

These fixes close specific audit findings; they do not complete operational deferral/fairness, loading tasks, driver dispatch, delivery/offline/receipt, intelligence promises or release gates. Full screen metrics/copy/CSV export, date-switch/error/forbidden journeys and Figma review still require follow-up. Candidate deferral remains scoped to the candidate; durable order carry-forward belongs to the next planned slice.
