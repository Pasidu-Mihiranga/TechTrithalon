# Driver workflow: verification

Date: 2026-10-03 (Asia/Colombo). This covers Round 2 Step 5 (implementation plan Phase 13): the driver runs a handed-over trip on a phone, records every order with proof, leaves each stop and finishes the trip. Designs: Figma Driver page `52:330`. Storage decision: [ADR 0001](adr/0001-proof-of-delivery-storage.md) (Cloudinary).

## Device-aware layouts (all roles)

The browser classifies itself as phone, tablet or desktop (`apps/web/src/lib/device.ts`) and sets `data-device` on `<html>`.

| Class | When |
|---|---|
| Phone | 767 px wide or less |
| Tablet | Up to 1023 px, or up to 1366 px with a touch pointer (an iPad Pro in landscape) |
| Desktop | Anything else |

Layouts switch on this class, not on one width breakpoint:

| Role | Phone | Tablet | Desktop |
|---|---|---|---|
| Driver | Figma phone design: page headers, floating tab bar (Home, Trip, Deliveries, Profile) | Same phone design in a centred 480 px column | Same, centred |
| Loader | Compact top bar with full-width tabs (Figma phone twins) | Figma tablet top navigation (834 px frames) | Top navigation |
| Dispatcher, store manager | Bottom tab bar | Compact icon rail, so content keeps its width | Full sidebar |

## What the driver can do

All counts, times and statuses come from `GET /api/v1/driver/*`.

- **Home** (`55:5282`): today's trip with its single action:
  - **Start Trip** once the loader has handed it over.
  - **Continue Trip** while it is running.
  - "Loading at depot" until the handover.

  The screen also shows progress, the trip summary (stops, orders, vehicle, distance and time) and other trips.
- **Trip overview** (`56:5295`): trip tabs, orders delivered, and the next stop with **Go to Stop**. The stop sequence shows Current, Upcoming, Done or Issue, with the projected arrival. A banner appears when the dispatcher republished the trip after it started.
- **Route** (`56:5398`): next stop, ETA, **Open Navigation** (opens the phone's maps for the stop's district) and **View Stop Details**.
- **Stop details** (`58:5317`):
  - Delivery window, dock and parking, and a chilled warning.
  - The orders at the stop.
  - **I've Arrived**, then **Start Delivery**.
- **Order delivery** (`58:5393`):
  - Units ordered and loaded, weight, volume and temperature.
  - "Sent short" when the loader sent fewer units.
  - **Report Issue** or **Delivered**.
- **Delivery confirmation** (`58:5464`; photo `835:20475`, signature `835:20586`):
  - Outcome: delivered, partial or failed.
  - Reason chips.
  - Proof photo, taken with the camera and compressed on the phone.
  - Signature, drawn on a pad.
  - Recipient name and notes.
- **Report issue** (`59:5378`) and **Issue recorded** (`59:5434`):
  - Six reason chips and units affected.
  - Customer unavailable and refused fail the whole order.
  - Any other reason gives a partial delivery with the remaining units.
- **Stop completed** (`60:5390`), **Trip completed** (`60:5432`) and **Trip submitted** (`60:5468`).
- **Deliveries** (`61:5417`; past trips `195:1029`): Today and Past Trips, search by order or outlet, and status filters.
- **Delivery details** (`61:5543`; proof sheet `206:1181`): timeline, trip, vehicle, recipient, units and the proof images.
- **Profile** (`61:5602`): name, driver ID, vehicle, depot, today's numbers and sign-out.

## Rules enforced by the server

| Rule | Response |
|---|---|
| A trip starts only after the loader handed it over | `409 TRIP_NOT_HANDED_OVER` |
| Trip 2 waits until trip 1 is finished | `409 PREVIOUS_TRIP_OPEN` |
| The start carries the displayed plan version | `409 ROUTE_CHANGED` with `currentPlanVersion` |
| A trip starts once | `409 TRIP_ALREADY_STARTED` |
| Every later action carries the trip version | `409 STALE_TRIP` |
| Record an order only after arriving at its stop | `409 NOT_AT_STOP` |
| One stop at a time; no second arrival at the same stop | `409 STOP_IN_PROGRESS` / `STOP_ALREADY_VISITED` |
| Leave a stop only when every order there is recorded | `409 STOP_INCOMPLETE` with `pendingOrders` |
| Finish only when every stop is left | `409 TRIP_INCOMPLETE` |
| One outcome per order | `409 ORDER_ALREADY_RECORDED` |
| Partial and failed need a reason chip; partial needs 1 to loaded−1 units | `422 ISSUE_REQUIRED` / `DELIVERED_UNITS_INVALID` |
| Delivered and partial need a recipient | `422 RECIPIENT_REQUIRED` |
| Delivered and partial need a proof file when storage is configured; proof files must belong to the order | `422 PROOF_REQUIRED` / `PROOF_INVALID` |
| Uploads: JPEG or PNG checked from the bytes, at most 5 MB and 40 MP, re-encoded without EXIF | `422 FILE_TYPE_INVALID`, `413 FILE_TOO_LARGE`, `400 INVALID_KIND` |
| No storage configured | `503 POD_STORAGE_UNAVAILABLE`; `GET /capabilities` reports `proofUploads: false` |
| A driver sees only trips published to them | Another driver's trip or order returns `404 NOT_FOUND` |
| A revision cannot move or remove orders on a trip the driver has started (stops still to serve may be resequenced) | Publication `409 TRIP_ALREADY_DEPARTED` |

The database also enforces:

- Outcome and units agree: delivered means all loaded units, partial means between 1 and loaded−1, failed means 0 with a reason.
- Delivered and partial outcomes have a recipient.
- An order has at most one outcome.
- A trip is completed exactly when it has a completion time.

Order status moves `planned → in_transit` when the trip starts, then to `delivered`, `partial` or `failed` when the outcome is recorded. Every action is in the audit trail with the actor and time.

**ETA (deterministic fallback):** after each event, the remaining stops are projected with the plan's own formula, which planning owns (`ArrivalCalculator.project`). The projection starts from:

- the trip start, plus the depot-to-district time, before the first stop;
- the last departure, plus the inter-stop time, after that;
- the arrival plus the service allowance, or now if later, while at a stop.

Early arrivals wait for the window to open, and an ETA after the window closes is flagged. There is no live location.

**Republish while on the road:**

- A trip keeps its identity (vehicle, trip slot, day) across plan versions, and stops are always read from the current version.
- When the orders of a handed-over trip are unchanged, the new load task stays handed over and needs no loader acknowledgement.

**Migration `V20261003_2300__delivery_workflow.sql`** is additive. It adds `delivery_trip`, `stop_visit`, `delivery_record` and `pod_asset`.

## Automated tests

| Check | Result |
|---|---|
| `./gradlew test` (full API, PostgreSQL Testcontainers) | **143 passed**, 0 failed (3 new in `DeliveryWorkflowIT`) |
| `DeliveryWorkflowIT` | Covers: home and default date; start rules (not handed over, stale plan, twice); arrive, upload (wrong type, wrong kind, a 3200×1600 PNG scaled to a 1600×800 JPEG, signature); recipient, proof and validation errors; delivered with two proofs; depart and finish; order detail with timeline and proof links; deliveries and past trips; audit rows; partial and failed outcomes; trip 2 blocked until trip 1 is finished; another driver gets 404; 401/403/404; a revision that defers a departed order is refused, while an unchanged revision keeps the handover and the running trip |
| Web unit tests | **110 passed** in total: `driver.test.tsx` (13), `device.test.ts` (3), routes (driver tab bar) |
| Playwright `tests/e2e/driver.spec.ts` (synthetic stack) | Passed: dispatcher publishes → driver phone shows "Loading at depot" → loader tablet counts and hands over → driver starts, arrives, delivers, finishes → record checked through the API → no horizontal overflow on five driver screens. `loader.spec.ts` still passes |
| Web typecheck, lint, build | Clean |

## Curl on a running API

PostgreSQL ran in Docker with all migrations; the migration applied cleanly to a database that already held loader data. The API ran on the host with the synthetic fixtures (`VEH901`, `SYN001` 12 units chilled, `SYN002` 8 units) and no `CLOUDINARY_URL`. The demo clock is fixed at 16:30 on the day before the delivery day, so projected times reflect a start at 16:30.

| Call | Status | Key result (SQL agrees) |
|---|---|---|
| `GET /driver/home?date=2026-06-26` | 200 | 2 trips, VEH901, trip 1 `LOADING`, 2 orders |
| `POST /driver/trips/1/start` (not handed over) | 409 | `TRIP_NOT_HANDED_OVER` |
| `GET /driver/trips/1` after handover | 200 | `READY`, planned 03:50, window 05:00–07:30, no ETA before the start |
| `POST /driver/trips/1/start` `planVersion` 9 | 409 | `ROUTE_CHANGED` |
| `POST /driver/trips/2/start` | 409 | `TRIP_NOT_HANDED_OVER` |
| `POST /driver/trips/1/start` | 200 | `IN_PROGRESS`, version 0, ETA projected; SQL order `in_transit` |
| same again | 409 | `TRIP_ALREADY_STARTED` |
| `POST …/orders/{SYN001}/outcome` before arrival | 409 | `NOT_AT_STOP` |
| `POST …/stops/OUT901/arrive` | 200 | `ARRIVED`, arrival time stored |
| same again | 409 | `STOP_ALREADY_VISITED` |
| `POST …/stops/OUT901/depart` version 0 / 1 | 409 / 409 | `STALE_TRIP` / `STOP_INCOMPLETE` |
| `POST …/proofs` text file / kind `VIDEO` / PNG | 503 / 400 / 503 | No storage configured: `POD_STORAGE_UNAVAILABLE`; `INVALID_KIND` |
| `POST …/outcome` no recipient / partial 12 of 12 / `LOST` | 422 / 422 / 400 | `RECIPIENT_REQUIRED` / `DELIVERED_UNITS_INVALID` / `VALIDATION_FAILED` |
| `POST …/outcome` delivered to S. Perera | 200 | SQL `DELIVERED 12/12 S. Perera`; order `delivered` |
| `POST /driver/trips/1/complete` early | 409 | `TRIP_INCOMPLETE` |
| `POST …/stops/OUT901/depart` | 200 | stop `COMPLETED`, stopsDone 1 |
| `POST /driver/trips/1/complete` | 200 | `COMPLETED`; SQL `completed` |
| `GET /driver/orders/{SYN001}` | 200 | Timeline: placed, loaded and handed over, out for delivery, arrived, delivered |
| `GET /driver/deliveries` / `past-trips` / `capabilities` | 200 | OUT901 delivered, OUT902 pending; 1 past trip; `proofUploads` false, 5 MB |
| Trip 2: start, arrive, `FAILED` without reason, then `CUSTOMER_UNAVAILABLE` | 200, 200, 422, 200 | `ISSUE_REQUIRED`; SQL order `failed`, record `FAILED CUSTOMER_UNAVAILABLE` |
| Revision deferring the departed order: `POST /dispatcher/plans/{v2}/publish` | 409 | `TRIP_ALREADY_DEPARTED` "VEH901 trip 2 has left the depot…" |
| `GET /driver/home` anonymous / dispatcher / loader | 401 / 403 / 403 | Trace ids match `X-Request-Id`, no internals |
| `GET /driver/trips/9`, `GET /driver/orders/999999` | 404 / 404 | `NOT_FOUND` |
| `GET /v3/api-docs` | 200 | 12 driver paths present |

Every failure body had a stable `code` and a `traceId` equal to `X-Request-Id`, with no stack traces, SQL or class names.

## Browser (Chromium, real API)

- **Phone** (402 × 874, touch; `data-device=phone`): the driver ran the full journey with no page errors. The path was Home → Start Trip → trip overview → Go to Stop → route → stop → I've Arrived → order → Delivered → validation message → recipient → Confirm → Stop completed → Finish Stops → Trip completed → Finish Trip → Trip submitted. The report-issue path (damaged, 2 of 12 units) recorded `PARTIAL 10/12 DAMAGED` in SQL.
- **Overflow:** none on Home, Trip, Deliveries, Profile or Delivery details.
- **Tablet** (834 × 1194, touch; `data-device=tablet`):
  - Driver: the phone design, centred.
  - Loader: the Figma tablet top bar.
  - Dispatcher: the compact icon rail.

  No overflow on any of them.
- **Desktop** (1440 px): the dispatcher sidebar is expanded.

## Departures from the Figma driver frames

- **No map or turn-by-turn directions** on Route: the outlet data has no coordinates or street addresses. The screen shows the stop order schematically, and **Open Navigation** opens the phone's maps for the stop's district.
- **Outlet shown by ID and district** instead of names and street addresses, which are not in the data.
- **One line per order, in units** (owner decision): no product lines, so the "Items", "Item (optional)" and per-product rows map to units ordered and loaded.
- **No notification bell or Notifications screen** (`62:5578`): there is no notification source yet. Profile says so.
- **No phone number or "hours online"** on Profile: not in the data. Profile shows trips today instead.
- **No device status bar** (9:41, battery): the real phone draws its own.
- **"Saved on this phone, will sync"** banners and the Offline Sync screens belong to Step 6. Today the header shows the real online or offline state, and a banner says that recording needs a connection.
- **Proof photos depend on configuration:** without `CLOUDINARY_URL`, the confirmation screen says photos are not set up and records the recipient's name only.
- **Before arrival** (no Figma frame), Stop details shows **I've Arrived**; arriving out of plan order is allowed and audited.
- Project font (Geist) and the existing dark token kept, as on the other screens.

## Not yet done

- **Real Cloudinary round trip:** not exercised, because no credentials are configured in this environment. Upload validation, re-encoding and attachment are covered with an in-memory store in `DeliveryWorkflowIT`. Set `CLOUDINARY_URL` and upload one photo before the demo.
- **Offline outbox and sync (Step 6):** writes need a connection today.
- **Store receipt (Step 7)** and the dispatcher's live view of trips on the road (Step 8).
- **Whole-stack Docker smoke run and a real-dataset run:** these need a machine whose network allows image builds. `scripts/smoke.sh` now covers driver reads and two failure paths.
