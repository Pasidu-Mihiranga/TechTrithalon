# Store receipt: verification

Date: 2026-10-04 (Asia/Colombo). Covers Round 2 Step 7 (implementation plan Phase 15). The store manager checks each delivered order against the driver's record and either confirms it or reports a discrepancy; the dispatcher decides disputes. Designs: Figma Store Manager page `412:8556` (Deliveries `89:7490`, Confirm Receipt `352:7457`, Report an issue `532:10602`, Issues `89:7890`).

## What each role can do

- **Store manager** (own outlet only; any other outlet's order is 404):
  - **Deliveries:** orders with a phase (Pending, In Delivery, Delivered), driver, vehicle, delivery window and planned arrival.
  - **Confirm receipt:** the driver's proof (recipient, time, access, photo and signature captured), a check table (ordered, loaded, delivered) and a status timeline.
  - **Report an issue:** short, damaged, wrong item or other, units affected and details.
  - **Issues:** open and resolved with the dispatcher's decision.
- **Dispatcher:** *Exceptions → Receipt discrepancies* shows open disputes with the driver's record and the vehicle, and **Resolve** takes a decision (credit, replacement or no action) and a note. The full exceptions queue is Step 8, which will absorb this panel.

## Rules and final status

| Rule | Response |
|---|---|
| Only the outlet's own orders are visible | Other outlets, unknown ids: `404 NOT_FOUND` |
| Receipt needs a recorded delivery | `409 NOT_DELIVERED_YET` before delivery, `409 NOTHING_DELIVERED` after a failed delivery |
| One receipt per order, confirm or dispute | `409 RECEIPT_ALREADY_RECORDED` with the stored outcome (the unique key also covers a race) |
| Dispute: kind SHORT, DAMAGED, WRONG_ITEM or OTHER; units 1 to the delivered units; OTHER needs details | `400 VALIDATION_FAILED`, `422 AFFECTED_UNITS_INVALID`, `422 NOTE_REQUIRED` |
| Dispatcher decides once, with a version and a note | `409 STALE_DISCREPANCY`, `409 DISCREPANCY_RESOLVED`, `422 NOTE_REQUIRED`; only a dispatcher with access to the depot (others: 404/403) |

**Final status semantics:**
- **Confirm:** the order moves from `delivered` or `partial` to `receipt_confirmed`.
- **Dispute:** the order stays `delivered` or `partial`, and a discrepancy opens.
- **Resolve:** the order moves to `receipt_confirmed`, with the decision and note kept on the discrepancy.

Every step is audited with actor and time. The driver's recorded units are never changed by a dispute.

**Migration `V20261004_1200__receipt_confirmation.sql`** is additive. It adds `receipt_confirmation` (one per order, with check constraints tying confirmed and disputed fields together) and `receipt_discrepancy`.

## Checks (quiet, run once)

| Check | Result |
|---|---|
| `./gradlew test` (full API, Testcontainers) | **149 passed** (3 new in `ReceiptIT`: phases through the lifecycle and a single confirmation; a failed delivery cannot be confirmed; a dispute, the dispatcher's decision and the order counting as received; plus 404/401/403 and the 400/422/409 cases) |
| Web unit tests | **129 passed** (6 new in `receipt.test.tsx`) |
| Curl on the running API (one script, mismatches only) | **40/40 passed**: status, error `code`, `traceId` equal to `X-Request-Id`, no leaked internals, values, SQL (order status, one open discrepancy), contract paths. Folded into `scripts/smoke.sh` |
| Playwright `lifecycle.spec.ts` | Passed: dispatcher publishes → store sees Pending → loader (tablet) hands over → driver (phone) starts, delivers, finishes → store sees In delivery, then Delivered → store reports a 2-unit shortfall → dispatcher resolves it → store sees the decision and the order is `receipt_confirmed` |
| `loader`, `driver`, `driver-offline` journeys | Still pass |
| Web typecheck, lint, build | Clean |

Screens were compared with Figma once (Confirm receipt and Issues).

## Departures from the Figma store frames

- **Per-order units, no product lines** (owner decision): the check table has one row per order; product names do not exist in the data.
- **One receipt per order**, not one per stop. Figma groups ORD-1163 and ORD-1165 on one screen.
- **Photo and signature** are shown as captured or not captured; the images are not shown to the store (they are held in Cloudinary and not exposed to this role).
- **No route progress dots, no "flagged by loader at 04:05" tag:** the driver's reported shortfall shows as "Short by N · flagged by the driver".
- **Absolute times** (for example "25 Jun, 16:30") instead of "4 days ago", so they cannot disagree with the server clock.
- Search, help and notification controls from the top bar are not built (existing shell).

## Not yet done

- Dispatcher exceptions queue and Live Operations, which will list receipt discrepancies with the other exceptions (Step 8).
- A real Cloudinary round trip, the Docker smoke run and a run on the real dataset.
