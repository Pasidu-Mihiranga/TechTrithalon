# CLAUDE.md

All project rules for AI agents live in **AGENTS.md** and apply to Claude in full:

@AGENTS.md

## Claude-specific notes

- **Figma**: use the Figma MCP to *read* designs (`get_metadata`, `get_screenshot`, `get_design_context`, `get_variable_defs`). Creating or editing anything in Figma counts as an outward-facing change (AGENTS.md §2): get the owner's approval first, and prefer a new page or file over changing existing frames.
- The live design file is `nfP1ZRvqcF2cJ4cWeZqyvT`. Pages: Dispatcher `412:8554`, Loader `412:8555`, Driver `52:330`, Store Manager `412:8556`. The MCP page list shows only Dispatcher; read the other pages by these IDs.
- Loader tablet frames (834 wide; each has a phone twin on the same page): Home `93:7502`, Trip `93:7636`, Order Loading `93:7810`, Report Shortfall `553:7136`, Shortfall recorded `749:12866`, All checked `767:12909`, Ready for handover `567:7166`, Trip Completion `94:7621`, Issues `94:7720` (open `789:13121`, resolved `789:13302`), Vehicle hold `801:15378` / `839:19949`, Manifest update `841:19967` (acknowledged `841:20037`), Profile `94:7860`, Login `1116:38070`. Phone: Home `365:7647`, Trip `365:7694`, Order Loading `365:7819`, Report shortfall `365:7862`, Trip Loaded `441:991`.
- Driver phone frames (402 wide): Home `55:5282`, Trip Overview `56:5295`, Route `56:5398`, Stop Details `58:5317`, Order Delivery `58:5393`, Delivery Confirmation `58:5464`, Report Issue `59:5378`, Issue Recorded `59:5434`, Stop Completed `60:5390`, Trip Completed `60:5432`, Trip Submitted `60:5468`, Deliveries `61:5417`, Delivery Details `61:5543`, Profile `61:5602`, Offline Sync `62:5536`, Sync Reconciled `188:913`, Notifications `62:5578`; action states section `835:19496` (proof photo `835:20475`, signature `835:20586`).
- Proof-of-delivery files go to Cloudinary (owner decision 2026-10-03, `docs/adr/0001-proof-of-delivery-storage.md`); configure `CLOUDINARY_URL`.
- Driver offline: all driver writes go through the `packages/field-core` outbox (`POST /api/v1/driver/sync`); driver TanStack hooks must use `networkMode: 'always'` or they pause offline. Offline frames: Offline Sync `62:5536`, Sync Reconciled `188:913`.
- Store receipt: the store confirms or disputes per order (`/api/v1/store/deliveries`, `/store/issues`); the dispatcher resolves at `/api/v1/dispatcher/receipt-discrepancies`. Store frames: Deliveries `89:7490`, Confirm Receipt `352:7457`, Report an issue `532:10602`, Issues `89:7890`.
- Layouts are chosen per device: `apps/web/src/lib/device.ts` sets `data-device` (phone/tablet/desktop) on `<html>`; shells key on it.
- Quantities are per order, in units (owner decision 2026-10-03): the data has no product catalog, so Figma's product-line, barcode and "choose affected item" screens map to one line per order.
- Before implementing a screen from Figma, load the `figma-design-to-code` skill and map the design to the existing tokens and components. Don't paste the generated reference code as-is.
- Java builds need JDK 21: `export JAVA_HOME=$(/usr/libexec/java_home -v 21)`.
- Run `./gradlew test` in `apps/api` (needs Docker for Testcontainers), `pytest` in `apps/intelligence`, and `pnpm --dir apps/web build` for the web app.
- **Endpoints**: after creating or changing any endpoint, rebuild with `docker compose up --build -d api`, then verify it with `curl` as required by AGENTS.md §6. Read the port from `.env` (`API_PORT`), because it may not be 8080 on this machine.
- **File structure**: AGENTS.md §5 fixes where files go. Before creating a new folder, module, package or app, or moving or renaming anything, stop and ask the owner. Don't use `mkdir` to invent a location.
- **Work log & ad-hoc refinements**: When doing ad-hoc tasks, UI refinements, or changes outside the formal plan, track them in `docs/WORK_LOG.md`.
- **Commit messages**: Write simple, humanized commit messages in plain language. Never mention internal phase numbers (e.g. avoid 'Phase 6', 'Phase 3A') in commit titles or messages as they are unclear to outside readers. Describe the actual feature or refinement instead.

## Round 2 (Hackathon) focus

Correctness and complete, high-quality implementation come first. Never cut scope or quality for time. Scoring (booklet p.13): engineering 25%, four-role functional completeness 20%, planning engine 20%, offline/degradation 10%, Day 5 design fidelity 10%, demo video 10%, creativity 5%.

Required: a judge completes **plan → load → deliver → receipt** across all four roles in the responsive web app. Loader and driver are judged on phone-sized screens. Native apps are optional.

### Part A: Round 2 requirements (in order, one step at a time; the owner approves each start)

| # | Step | Plan phase | Complexity |
|---|---|---|---|
| 1 | Close planning gates: commit pending fixes, final metrics/copy check | 3A/5/6 | Low |
| 2 | Durable deferral, carry-forward flag, store deferral notice | 8 (core) | Medium |
| 3 | Operational publish: trips, load tasks, driver assignment, current version | 11 | High |
| 4 | Loader API + tablet UI (Figma Loader Home `93:7502`, 1024×768, phone usable) | 12 | Medium–High |
| 5 | Driver API + phone PWA UI (Figma Driver Home `55:5282`, 402×874) | 13 | High |
| 6 | Driver offline outbox + idempotent sync + reconcile screen | 14 | High |
| 7 | Store receipt confirm/dispute | 15 | Medium |
| 8 | Dispatcher exceptions queue + Live Operations by polling | 10 (ops part) / 16 | Medium |
| 9 | README walkthrough and departures, architecture/data model, AI disclosure, deploy | 21–22 (light) | Low (docs) / Medium (deploy) |

### Part B: remaining plan phases (after Part A, same rules)

| # | Step | Plan phase | Complexity |
|---|---|---|---|
| 10 | Automatic planning: Spring greedy, then Python CP-SAT, with validation and fallback | 9 | High |
| 11 | Full explainability: alternatives, dry-run preview/apply, ranked fixes | 10 (rest) | High |
| 12 | Driver Android app (Expo), reusing `field-core` | 14A | High |
| 13 | Forecasting foundation | 17 | Medium–High |
| 14 | Service-time and late-risk ML | 18 | High |
| 15 | Capacity decision support | 19 | Medium |
| 16 | Advanced decision support | 20 | Medium |
| 17 | Full hardening, then full-system verification | 21–22 | Medium |

The driver **PWA comes before the APK.** Part B phases are not dropped. Until they are built, the README lists them honestly as not yet implemented.

Before starting a step, state its complexity (Low / Medium / High) and the reason, then wait. The owner picks the model.

## Cost rules (keep token use low)

- **Verification (owner decision 2026-10-03, details in AGENTS.md §6):** integration tests are the main proof. Run one quiet curl script per step that prints only mismatches, and fold it into `scripts/smoke.sh`. Run affected tests while building and the full suites once at the end, in the background. Take one screenshot per new screen. Keep chat reports short.

- **Read narrowly.** Don't read `TECHNICAL_REFERENCE.md` (3.4k lines), `IMPLEMENTATION_PLAN.md` or the verification docs whole. `grep -n` for the section, then read only those lines. Read the booklet only from the extracted text, and only the pages needed.
- **Figma:** call `get_metadata` once per flow. Take `get_screenshot` / `get_design_context` only for the frame being built right now.
- **No subagents** unless the owner asks for one.
- **Tests while iterating:** run only the affected test class (`./gradlew test --tests '*LoadingIT'`) or file (`pnpm --dir apps/web test <path>`). Run the full API and web suites once, at the end of the step.
- **Rebuild only the changed service** (`docker compose up --build -d api` or `web`).
- **Evidence goes into a doc, compactly:** one table row per curl (method, path, status, key value). Don't paste full JSON bodies.
- **Work log:** at most 6 bullets per step in `docs/WORK_LOG.md`. Update the plan checkboxes only with evidence.
- Reuse existing components, query hooks and module patterns (copy from `ordering` / `planning`) instead of designing new abstractions.
