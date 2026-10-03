# Driver offline mode: verification

Date: 2026-10-03 (Asia/Colombo). This covers Round 2 Step 6 (implementation plan Phase 14). The driver keeps working with no signal, and everything recorded reaches the server exactly once when the connection returns. Designs: Figma Driver Offline Sync `62:5536` and Sync Reconciled `188:913`, plus the offline states on Stop Details and Order Delivery (`58:5317`, `58:5393`).

## How it works

```
Driver taps an action
   │  saved first in IndexedDB (outbox entry, UUIDv7 made on the phone, device time)
   ▼
Screen updates at once (server copy + outbox actions, projected locally)
   │
   ▼  sync triggers: right after saving · connection back · app back in front · every 30 s
POST /api/v1/driver/sync  { actions: [...] }     proof files: POST …/proofs?clientUploadId=
   │  per action, own transaction, in device order:
   │  claim the id (dedupe) → apply through the delivery rules → store the result
   ▼
APPLIED · DUPLICATE (stored result repeated) · CONFLICT · REJECTED   (+ review flag)
```

- **Shared logic:** `packages/field-core` holds the outbox, the sync engine, the local projection and UUIDv7, behind a storage port and a transport port, so the native app (Phase 14A) reuses them.
- **Web adapters:**
  - `lib/offlineStore.ts`: IndexedDB through Dexie, one database per signed-in driver.
  - `lib/syncTransport.ts`: the API.
  - `lib/fieldSync.ts`: the engine for the signed-in driver.
- **Offline reads:** every driver screen saves the last server answer. With no connection, it opens from that copy plus the actions still waiting. Opening Home online stores the whole day (both trips).
- **App shell:** `apps/web/public/sw.js` caches the app so the installed PWA opens with no signal (owner approved the `public/` folder). `manifest.webmanifest` makes it installable. API data is never cached by the service worker; it lives in IndexedDB.
- **Proof photos offline:** the photo is compressed on the phone and saved as a blob in the outbox. It uploads before the outcome that references it, under a client id, so a retried upload returns the same stored file.
- **Offline session:** a driver's last server-confirmed identity is kept on the phone so the app can open without signal. It grants nothing: every sync still needs the session cookie, and a 401 or sign-out clears it. Other roles need a connection.

## Conflict policy

| Situation | Result | Why |
|---|---|---|
| Same action retried (lost response) | `DUPLICATE` with the stored result; no second effect | The dedupe is the primary-key insert of the client action id |
| Same effect already in place (for example recorded online first) | `APPLIED`, code `ALREADY_APPLIED` | Nothing to change; not an error |
| Order already recorded with a different outcome | `CONFLICT ORDER_ALREADY_RECORDED` with both records in `detail` | First write wins; the second is shown for review, never silently overwritten |
| Dispatcher moved or deferred the order while the phone was offline | `APPLIED`, review `ORDER_NOT_ON_TRIP`; the record is kept and the order takes the outcome | The driver was there: the field record wins and the dispatcher reviews it |
| Dispatcher changed the trip after it left loaded (offline start) | `APPLIED`, review `ROUTE_CHANGED_OFFLINE` | The truck left loaded on the earlier version |
| Stop moved off the trip while offline | `APPLIED`, review `STOP_NOT_ON_TRIP` | As above |
| A proof file did not arrive with a delivery | `APPLIED`, review `PROOF_MISSING` | The record is kept, not lost |
| Invalid action (for example partial without a reason) | `REJECTED` with the rule's code | Shown on the sync screen |
| State disagrees (for example arriving after the trip finished) | `CONFLICT` with the code | Shown on the sync screen |
| Device clock implausible (more than 5 min ahead or 48 h behind the server) | Applied; `clockSkew: true`; device time kept as reported | Never silently rewrite what the device reported. Departure never precedes arrival |
| Session expired | Nothing sent; entries stay pending; "Sign in again to sync N saved actions" | Queue recovery after sign-in |
| Republish while on the road | Stops already done stand; remaining stops follow the current version | Stops and orders are read from the current published version; the departed-trip guard (Step 5) keeps the truck's orders on it |

**Retention:**
- Server side, `sync_command` rows are kept for 90 days (`app.sync.retention`, purged daily at 03:15 Colombo). Deliveries and the audit trail stay.
- On the phone, settled entries are kept for 7 days for the sync screen. Pending entries are never pruned.

**Migration `V20261004_0900__offline_sync.sql`** is additive. It adds `sync_command`, `pod_asset.client_upload_id` (unique per uploader) and `delivery_record.review_reason`.

## Screens

- **Header pill:** Online / `Offline · N` / `Syncing d/t` / `Review · N` / `Saved · N`. It opens Sync Status.
- **Offline banner:** "Offline — saved on this phone, will sync automatically" (Figma). When a screen is opened from the saved copy, it says so.
- **Sync Status:**
  - Offline: "No connection / Your delivery records are safe", the count of saved actions, the auto-sync note, the last sync, and "View Saved Records".
  - Back online: progress "x of y records synced", then "1 record needs review" with the reason, and Continue. Continue acknowledges the review list.
  - "Sync now" retries manually.
- **Sign-out with unsynced actions:** Profile says they stay on the phone and sync after signing in again.

## Automated tests

| Check | Result |
|---|---|
| `./gradlew test` (full API, PostgreSQL Testcontainers) | **146 passed**, 0 failed (3 new in `SyncIT`) |
| `SyncIT` | Covers: an out-of-order batch applied in device order with device times stored, and a retry returning `DUPLICATE` with no second record, visit or audit row; a stored rejection repeated as `DUPLICATE`; an online record then the same outcome giving `ALREADY_APPLIED`, and a different outcome giving `CONFLICT` with both records; an unknown stop; a skewed clock flagged and kept, with departure never before arrival; 400/401/403; and the driver's record winning when the dispatcher deferred an order while the phone was offline (`ROUTE_CHANGED_OFFLINE`, `ORDER_NOT_ON_TRIP`, order `delivered`) |
| `field-core` unit tests (10) | UUIDv7 format and order; save-before-send and creation order; offline keeps everything and a restart reads it back; uploads before the outcome; conflict review and acknowledge; missing result stays pending; expired session recovers; projection (counts move once, idempotent, other trips ignored, home and rows) |
| Web unit tests | **123 passed** in total, including an arrival saved offline (shown at once, "Offline · 1", banner) and the sync screen (offline count, saved records, review after reconnect, Continue) |
| Playwright `driver-offline.spec.ts` (synthetic stack) | Passed. The driver opens the day online, goes offline (`context.setOffline`), then starts, arrives, delivers, finishes the stop and the trip. The pill shows `Offline · 5` and the server still shows the order `planned`. Back online, the outbox drains on its own ("All synced"): the order is `delivered` and the trip `COMPLETED`. SQL: 1 record, 1 visit, 5 sync rows, all `APPLIED` |
| `driver.spec.ts`, `loader.spec.ts` | Still pass |
| Production build + service worker (`vite preview`, Chromium, phone) | Page controlled by the worker and manifest served. Offline reload opens Home from cache with the saved trip; an offline start shows `Offline · 1`; a deep link (`/driver/trips/1/stops/1`) opens offline; back online, "All synced"; no page errors |
| Web typecheck, lint, build | Clean |

## Curl on a running API

The API ran on the host with the synthetic fixtures. The demo clock is fixed at 2026-06-25 11:00Z, so device times on the delivery day count as "ahead" and get `clockSkew: true`; they are kept as sent.

| Call | Status | Key result (SQL agrees) |
|---|---|---|
| `POST /driver/sync` with deliver, finish-stop, start and arrive (sent out of order) | 200 | All `APPLIED`, applied start first; SQL order `delivered`, record time 23:49 (device) |
| same body again | 200 | 4 × `DUPLICATE` (stored `APPLIED`); SQL 1 record, 1 visit, 4 sync rows |
| same outcome, new id | 200 | `APPLIED` / `ALREADY_APPLIED` |
| different outcome (`FAILED REFUSED`) | 200 | `CONFLICT ORDER_ALREADY_RECORDED`, detail recorded `DELIVERED 12` vs sent `FAILED 0` |
| `TRIP_COMPLETE` with device time 2026-06-20 | 200 | `APPLIED`, `clockSkew` true; trip `completed`, completion not before the start |
| arrive after the trip finished | 200 | `CONFLICT TRIP_COMPLETED` |
| `clientActionId` not a UUID / empty `actions` | 400 / 400 | `BAD_REQUEST` / `VALIDATION_FAILED` |
| no session / loader / dispatcher | 401 / 403 / 403 | Trace ids match `X-Request-Id`, no internals |
| `GET /v3/api-docs` | 200 | `/api/v1/driver/sync` present |

## Departures and limits

- Live map data does not exist (Step 5). Offline ETAs are the last server projection; they are recomputed on the next sync.
- A real Cloudinary upload is still not exercised (no credentials here); offline photo upload and idempotency are covered with the in-memory store.
- Device-clock skew is flagged on the action result. Showing it to the dispatcher is part of Step 8 (exceptions).
- The "Route updated" full-screen frame (`835:19616`) is not built separately. The trip screen shows the server's `routeChanged` banner, and the review list explains offline route changes.
