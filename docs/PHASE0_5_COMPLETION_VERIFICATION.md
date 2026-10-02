# Phase 0–5 completion corrections — 2026-10-02

This record separates implemented corrections from running-stack exit gates. No phase is declared complete from code inspection alone.

## Corrected implementation

- CI uses the five-row synthetic calendar and configures the synthetic demo directory/counts. Its walkthrough clock is explicit; no competition data is required by CI.
- Ordering fails with `NO_OPERATING_DAY` when the future calendar is missing. The optional `DEMO_CLOCK_INSTANT` controls the injected clock for local demonstrations only.
- Review sends an optional expected delivery date. A changed date returns `409 DELIVERY_DATE_CHANGED`; the UI refreshes and requires another review. Confirmation shows the persisted response date and refreshes the order cache.
- An additive Flyway migration enforces one active order per outlet/date/temperature. Concurrent inserts use `ON CONFLICT DO NOTHING`, yielding one creation and one stable `409`, without an aborted SQL transaction leaking into the error response.
- Complete snapshots freeze order contents/versions, vehicle caps and fuel efficiency/state, outlet restrictions and windows, travel, service allowances, calendar and rule parameters. SHA-256 hashes the complete canonical payload; the reference version hashes the frozen reference subset.
- Snapshot create/compare use PostgreSQL repeatable-read transactions. Create enforces order closure and audits the actor. A database trigger rejects updates.
- `all` and `selected` snapshots retain distinct membership policies during comparison. Legacy rows are readable, explicitly incomplete, and require regeneration; historical inputs are never invented.
- The queue's date and depot also scope snapshot creation. Server pagination is reachable, selection is restricted to confirmed orders, and scope changes clear selection. The UI supports checking drift, regeneration, latest-snapshot reload and inspection of frozen orders. Counts returned with snapshots are computed server-side.
- Store order lists also paginate. Order detail displays actual placement/confirmation events. Read failures retain their HTTP status so forbidden states can be shown.
- Dedicated empty layouts replace generic pages for deferred orders, exceptions, live operations, forecasting, capacity decisions and later planning stages. Profile uses session data; dispatcher global search calls the existing order query. The shell logo is the original local Figma asset. No illustrative operational numbers or routes were copied.
- The production-source guard inspects imports across production TypeScript files instead of inspecting only query-hook export names.
- Smoke checks now cover complete snapshot membership, invalid selection, unknown resources, wrong roles and matching request/trace IDs.

## Fresh checks completed

| Check | Result |
|---|---|
| Web Vitest | 47 tests passed |
| ESLint | Passed |
| TypeScript | Passed |
| Production build | Passed |
| Backend unit/contract checks | 10 tests passed, including exact 16:00, calendar exhaustion, state machine, errors and health |
| OpenAPI regeneration | Passed; generated from the application |
| TypeScript client regeneration | Completed |
| Client/token regeneration repeatability | Passed; regenerated files unchanged |
| Python health tests | 3 passed; one existing Starlette deprecation warning |
| Smoke script syntax | `bash -n scripts/smoke.sh` passed |

PostgreSQL tests have been added for simultaneous confirmation, reviewed-date mismatch, exhausted calendar, frozen input contents, reference/order drift, selected membership, database immutability, pagination, cutoff boundaries and depot scope. They must run before their assertions count as evidence.

## Figma reads

The design-to-code skill was loaded. Inspected file `nfP1ZRvqcF2cJ4cWeZqyvT` and design context/screenshots for confirmed orders (`21:598`), deferred orders (`48:4944`), live operations (`76:5697`), exceptions (`76:6013`), forecast (`390:7953`), capacity decision (`372:8035`), profile (`76:6354`), generation (`25:2465`) and publication (`33:4738`). Large review/triage frames were followed to high-fidelity body contexts `28:3141` and `30:3734`.

These reads establish layout targets, not a passing browser visual comparison. Store screens remain composed from the established design system and require design review. Previously accepted status-colour contrast exceptions remain documented in the implementation plan.

## Running-stack gates still pending

Docker Desktop reported: `Docker Desktop is manually paused. Unpause it through the Whale menu or Dashboard.` Consequently no new migration, PostgreSQL integration test, Compose smoke, browser journey or endpoint response is recorded as verified yet.

Required after Docker is available:

1. Run the entire backend test suite with Testcontainers.
2. Check the existing database for active duplicates before applying the unique index. Do not delete or rewrite operational data automatically.
3. Build/start the stack; use an isolated synthetic fixture stack for write and failure-path probes.
4. Run curl happy/failure checks for changed order, cutoff, queue, snapshot create/read/latest/compare operations. Compare returned values with PostgreSQL, including audit and immutable payload rows. Record actual statuses, bodies and trace headers here.
5. Run smoke and Playwright store/planning/auth journeys, including reload, selection, pagination, desktop and phone layouts.
6. Run contract/client/token repeatability checks.
7. Compare running pages with the inspected Figma targets; record remaining visual differences honestly.
8. Obtain a green GitHub CI run before Phase 0 closes. Committing/pushing requires the owner's explicit instruction under AGENTS.md.

Existing incomplete snapshots remain archived. If active duplicate orders prevent migration, their resolution requires owner approval; the migration intentionally fails instead of discarding data.

## Phases remaining after these gates

The next phase is **6 — Trip-Time & Constraint Engine**, after the Phase 5 snapshot gate passes. Later planning tabs and operational empty layouts do not implement these capabilities.

| Phases | Work remaining |
|---|---|
| 6–11 | Independent constraint validation, manual planning, deferral/fairness, automatic planning, explanations/exceptions, publication/versioning |
| 12–15, including 14A | Loader and driver workflows, offline synchronization, Android client, receipt confirmation |
| 16–20 | Live operations, forecasting, service-time/late-risk models, capacity and advanced decision support |
| 21–22 | System hardening and full-system verification |
