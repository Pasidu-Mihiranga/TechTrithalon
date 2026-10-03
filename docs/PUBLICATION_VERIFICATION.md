# Operational publication: verification

Date: 2026-10-03 (Asia/Colombo). Covers Round 2 Step 3 (implementation plan Phase 11): publishing a plan as an operational handoff, replacing a published version, fuel accounting, frozen schedule, driver assignment and load tasks.

## What publication does now

Publishing a candidate is one transaction. Any failure rolls back every part.

1. Recheck the persisted candidate: optimistic version, snapshot freshness, every hard rule (independent validator), every order assigned or explicitly deferred, no empty trips.
2. Check the candidate still revises the **current** published version of the run (`based_on_plan_id`). If another version was published in between, `409 STALE_BASE` (or `409 SNAPSHOT_CHANGED` when that publication also changed the inputs).
3. Return the replaced version's fuel to the weekly ledger, then reserve the new version's fuel. Fuel is counted exactly once per current plan.
4. Mark assigned orders `planned` (orders already planned by the replaced version keep their state). Record deferrals and move deferred orders to the next run, including orders a revision takes off a trip.
5. Mark the replaced version `superseded` (`superseded_by_plan_id`, `superseded_at`) and withdraw its load tasks (`superseded`).
6. Publish the candidate with its rule version (`booklet-v1`).
7. Freeze the validated schedule on `trip` (planned departure, trip minutes, distance, fuel, driver) and `stop` (planned arrival, service start).
8. Assign each trip to the active driver account linked to its vehicle (`app_user.vehicle_id`). A vehicle without a linked driver publishes with no driver; driver availability is not a planning rule.
9. Create one `pending` load task per trip, stamped with the plan version, with one line per order (units, kg, m³ copied from the order) in loading order: the last stop loads first.
10. Write the audit trail (`plan.published`, `plan.superseded`, `vehicle.fuel.released` / `reserved`, `load_task.created` / `superseded`, order and deferral events).

### Revisions

- A snapshot taken after publication includes the orders the current version planned, so a revision re-plans the whole run. It records the fuel the current version reserved (`fuelReservedByCurrentPlanL`), and the validator does not count it twice.
- `POST /api/v1/dispatcher/plans` on a run that has a published version creates a revision (`basedOnPlanId`). By default it starts from a copy of the published trips (`startFrom: "published"`). If the copy breaks a rule with current inputs (for example the vehicle went to the workshop), the call returns `422 REVISION_COPY_INFEASIBLE` with the violations, and `startFrom: "empty"` starts with every order unassigned.
- Orders deferred by an earlier published version stay on their next run. A revision cannot pull them back; they appear in the next run's queue with their carry-forward protection.
- `GET /api/v1/dispatcher/plans/{id}/changes` returns the server-computed difference against the version a plan revises. Per order: added, removed, moved, resequenced or unchanged. Per trip slot: added, removed, changed or unchanged, with the driver before and after. Step 5 and later the loader read the same result.

### Quantities

Orders have no product lines in the supplied data, so loading, delivery and receipt count **per order, in units** (owner decision, 2026-10-03). This is a documented departure from the design's line-item catalog.

## Automated tests

| Check | Result |
|---|---|
| `./gradlew test` (full API, PostgreSQL Testcontainers) | **135 passed**, 0 failed (7 new in `OperationalPublicationIT`) |
| `OperationalPublicationIT` | Frozen schedule matches the validator; driver copied; load lines copy units, kg and m³ with reverse load order; republish supersedes and leaves 4.00 L instead of 12.00 L; stale revision gets `STALE_BASE` with no writes; two concurrent publishes give exactly one 200 and one 409; copied trips on a workshop vehicle get `REVISION_COPY_INFEASIBLE` and an empty revision works; a vehicle without a driver publishes with none; an empty trip is refused; 401/403/404 and cross-depot 404 on changes; invalid `startFrom` gives 400 |
| Web unit tests | All pass (see work log). Step 5 tests cover the revision change summary, the published and replaced views, and refusing a stale candidate |
| Web typecheck, lint, build | Clean |

## Curl on a running API

PostgreSQL 16 in Docker with all migrations; the API on the host (`./gradlew bootRun`) with the synthetic reference and demo fixtures (2 orders, `VEH901`). The Docker image build could not run in this container, because its network proxy re-signs TLS and the Gradle download in the image fails certificate checks. As the integration tests do, the throwaway database set `OUT901` to normal parking so the reefer truck can serve it. The real dataset and credentials are not in the evidence.

| Call | Status | Key result (SQL agrees) |
|---|---|---|
| `POST /dispatcher/planning/snapshots` | 201 | orders `[1, 2]` |
| `POST /dispatcher/plans` | 201 | plan 4, `basedOnPlanId` null |
| `POST /dispatcher/plans/4/trips` ×2 | 200, 200 | Fresh slot 1, Style slot 2 on `VEH901` |
| `POST /dispatcher/plans/4/publish` | 200 | published, rule `booklet-v1`; trips `03:30` 31 min 4.0 L and `08:00` 52 min 4.0 L, driver assigned, load `pending`. SQL: same trip rows, load tasks `1:v1:pending, 2:v1:pending`, ledger **8.00 L** |
| `GET /dispatcher/plans/4/changes` | 200 | `firstVersion` true, 2 added, 2 trips added |
| `POST /dispatcher/planning/snapshots` (after publication) | 201 | orders `[1, 2]` (planned orders included) |
| `POST /dispatcher/plans` with `startFrom: "latest"` | 400 | `VALIDATION_FAILED`, `traceId` = `X-Request-Id`, no internals |
| `POST /dispatcher/plans` | 201 | plan 5, version 2, `basedOnPlanId` 4, 2 copied trips, fuel before 0 |
| `DELETE /plans/5/trips/{style}`, `POST /plans/5/orders/2/defer` | 200, 200 | Style trip removed, order deferred (`OTHER`) |
| `GET /dispatcher/plans/5/changes` | 200 | base 4: 1 removed, 1 unchanged, 1 trip removed |
| `POST /dispatcher/plans/5/publish` | 200 | published, 1 trip. SQL: `4:v1:superseded by 5, 5:v2:published`; ledger **4.00 L**; 1 `vehicle.fuel.released`; load tasks `v1 superseded ×2, v2 pending`; order 2 `deferred` to `2026-06-27` |
| `POST /dispatcher/plans/6/publish` (revision of version 1) | 409 | `SNAPSHOT_CHANGED`, matching trace id |
| `POST /dispatcher/plans/4/publish` (superseded) | 409 | `PLAN_LOCKED` |
| `GET /dispatcher/plans/4/changes` anonymous / store manager / unknown id | 401 / 403 / 404 | `UNAUTHENTICATED` / `FORBIDDEN` / `NOT_FOUND`, matching trace ids, no leaks |
| `GET /dispatcher/plans/4` | 200 | `superseded`, `supersededByPlanId` 5, load `superseded` ×2 |
| `GET /v3/api-docs` | 200 | contains `/api/v1/dispatcher/plans/{id}/changes` |

`scripts/smoke.sh` now reads `/plans/{id}/changes` for its candidate and checks the 404. The whole-stack smoke run needs the Docker images and was **not** run here.

## Browser

Chromium against the Vite dev server and the API above. Step 5 for the published version 2, the replaced version 1 and a stale revision 3 rendered with no page errors. The published view shows the frozen timeline (published time, driver, waiting for the loader, first departure 03:30), the run totals and the frozen manifest. The replaced view links to the current version and offers no Revise action. The stale candidate cannot be sent and links to version 2.

## Departures from the Figma 5A/5B frames (`33:4738`, `33:4336`)

- No "SMS delivered" step and no notification toggles: there is no SMS or email service. The screen says so.
- No route map: outlets have no coordinates (technical reference). The "at a glance" card shows totals only.
- "Loader acknowledged" is shown as "Waiting for the loader" with the load-task state; acknowledgement arrives with the loader workflow (Step 4).
- "Loading starts" has no source time and is not shown. "First vehicle departs" uses the frozen planned departure.
- No loading bay: bays are not in the data.

## Not yet done or verified

- Loader and driver screens that read the load tasks and trips (Steps 4 and 5). How loading progress carries over when a version is replaced mid-load is decided with the loader workflow.
- Store notifications for planned orders beyond the existing order status and deferral notices.
- Whole-stack Docker smoke and a real-dataset run: run them on a machine whose network allows the image builds.
