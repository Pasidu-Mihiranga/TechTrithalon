# AGENTS.md — rules for AI coding agents

These rules apply to every AI agent working in this repository (Claude Code, Codex, Copilot, Cursor and others). They come from the project owner. When a rule conflicts with an agent's defaults, **this file wins**. When it conflicts with a direct instruction from the owner in the current conversation, the instruction wins.

Project context: [README](README.md) · [Implementation plan](docs/IMPLEMENTATION_PLAN.md) · [Technical reference](docs/TECHNICAL_REFERENCE.md)

---

## 1. Data rules

1. **No hard-coded data unless the owner explicitly asks for it.** UI values, counts, KPIs, lists, names, dates and statuses come from the backend API. This includes demo or "temporary" data.
2. **No mock APIs, fake services or sample JSON in application code.** Test fixtures are allowed only under test directories, and must be synthetic.
3. **When the backend can't supply something yet, show an honest empty state** that says what is missing. Never fill the gap with plausible-looking numbers.
4. **Business numbers are computed server-side.** The UI formats values; it does not derive capacity, totals, utilisation or deferral counts.
5. **Never commit the competition dataset** (`dataset/`, real CSVs or anything derived from them). The repository is public and the competition terms forbid uploading the data. Synthetic fixtures must be invented values, not copies.
6. **Never commit secrets.** No `.env`, passwords, tokens or keys. Only `.env.example` with placeholder values.

## 2. Human verification required (stop and ask first)

Do **not** proceed on your own with any of the following. Explain the change, its impact and the alternatives, then wait for the owner's approval:

- **Architecture changes**: adding, removing or replacing a framework, service, database, message broker, cache, language, or deployment target. Changing module boundaries, or the Spring ↔ Python responsibility split.
- **High-impact changes**: database schema changes that drop, rename or retype columns; data migrations; authentication and authorization changes; changes to the planning constraint rules or the trip-time formula; changes to the public API contract that break existing clients.
- **Dependency changes with wide effect**: major-version upgrades (framework, build tool, runtime), or adding a dependency that the whole app relies on.
- **Destructive or irreversible actions**: deleting files or branches, `git reset --hard`, force-push, rewriting history, dropping database data.
- **Anything outward-facing**: `git push`, opening or merging PRs, publishing builds or artifacts, deploying, editing the Figma file, or posting to external services.
- **File-structure changes**: any change to the predefined structure in section 5 — see that section. Ask first, before creating, moving, renaming or deleting anything that changes the structure.
- **Scope changes**: building features outside the current phase, or skipping a phase's exit gate.

Small, local, reversible changes inside the current task (a bug fix, a test, a component in the agreed design) do not need approval.

## 3. Work in the agreed order

1. Follow the [implementation plan](docs/IMPLEMENTATION_PLAN.md) phase order and exit gates. **Current UI priority: Dispatcher and Store Manager first (Phase 3A); Loader and Driver later.**
2. **Do only what was asked.** If the owner asks for structure only, create structure only. Don't implement ahead.
3. Respect the **predefined file structure** (section 5). Work in **vertical slices**: migration → Spring → OpenAPI → generated client → UI → tests. A feature is done only when it meets the plan's definition of done.
4. Mark a plan checkbox only with evidence (a test run, a PR, a running screen). Never mark something done that wasn't verified.
5. **Additional tasks, UI refinements & work log:** When the owner requests UI refinements, testing aids, or ad-hoc tasks outside the formal implementation plan, accommodate them. Always keep [`docs/WORK_LOG.md`](docs/WORK_LOG.md) updated with a chronological log of what was done (date, summary, files/features touched, and rationale) for both plan milestones and ad-hoc additions.

## 4. Architecture guardrails

- **Spring Boot owns all operational state.** Python (`apps/intelligence`) receives what it needs in the request and returns a result. It never gets database credentials and never writes orders, plans, deliveries or users.
- **The validator is independent of the planner.** No plan is published without Spring re-checking every hard constraint.
- **Machine-learning predictions never override hard constraints.**
- **Schema changes go through Flyway only.** Name migrations with a timestamp: `VYYYYMMDD_HHMM__description.sql`.
- **The API contract is generated.** After changing an endpoint, regenerate `apps/api/openapi.json` and the TypeScript client. Never hand-edit generated files.
- **Modules talk through published services or events**, never through another module's repository. Cross-module references are by ID, not JPA associations.
- **Business time is Asia/Colombo.** Use the injected `Clock`; never call `now()` directly in business code.
- **Driver clients**: a PWA (web) and a React Native Expo app (`apps/mobile`) share offline logic in `packages/field-core`. Don't duplicate sync logic in either app.

## 5. File structure rules (the structure is fixed)

The repository layout is **predefined** (see the tree in [README](README.md#repository-structure)). Every feature goes into an existing place. **Never invent a new location, and never change the structure without asking first.**

### Where things go

| What | Where |
|---|---|
| Spring feature code | `apps/api/src/main/java/lk/techtrithalon/waypoint/<module>/` using only `api/`, `application/`, `domain/`, `infrastructure/` |
| Cross-cutting Spring code (errors, time, web filters, config) | `shared/` (`error/`, `time/`, `web/`) only |
| Database changes | `apps/api/src/main/resources/db/migration/VYYYYMMDD_HHMM__description.sql` — new file per change, never edit an applied migration |
| Spring tests | `apps/api/src/test/java/lk/techtrithalon/waypoint/<module>/` mirroring the main package |
| Test fixtures | `apps/api/src/test/resources/` (synthetic data only) |
| React feature code | `apps/web/src/features/<feature>/` |
| Shared React components | `apps/web/src/components/` |
| API client, config, offline helpers | `apps/web/src/lib/` |
| PWA files served as-is (service worker, web manifest, app icons) | `apps/web/public/` |
| Generated API types | `apps/web/src/generated/` (never hand-edit) |
| Web tests | next to the code as `*.test.ts(x)`; end-to-end tests in `apps/web/tests/e2e/` |
| Python code | `apps/intelligence/techtrithalon_intelligence/<planning\|forecasting\|prediction\|features>/` |
| Python tests | `apps/intelligence/tests/` |
| Code shared by web and mobile | `packages/api-client`, `packages/field-core`, `packages/design-tokens` |
| Driver mobile app | `apps/mobile/` |
| Docker and deployment files | `infrastructure/` |
| Helper scripts | `scripts/` |
| Documentation | `docs/` (decisions in `docs/adr/`, diagrams in `docs/architecture/`) |

### Rules

1. **Keep to the structure.** Put each file where the table says. A Spring class goes in its module's layer folder, not in the module root or in `shared/`. Feature code never goes in `components/`, and shared components never go inside a feature folder.
2. **Use the module that owns the concern.** Orders belong in `ordering`, plans in `planning`, and so on. Don't put one module's logic in another. Modules reach each other through a published service in `application/`, never through another module's `infrastructure/` or repository.
3. **Fill empty folders; don't bypass them.** The empty placeholder folders (with `.gitkeep`) mark where future features go. Add your files there and delete the `.gitkeep` once the folder has real content.
4. **Follow the naming conventions already used**: Java classes in `PascalCase` with the existing suffixes (`...Controller`, `...Service`, `...Properties`); React features in `kebab-case` folders; Python in `snake_case`; migrations as described above.
5. **No stray files.** No scratch files, copies, backups or generated output in the repo. Put temporary files outside the project directory.

### Ask first (stop and wait for approval) before any of these

- Creating a **new top-level folder**, a **new app** (`apps/*`), a **new package** (`packages/*`), or a **new backend module** (a new folder next to `ordering`, `planning`, and so on).
- Adding a **new layer or sub-folder convention** (for example a new folder inside `api/` or `domain/`, or a new folder under `src/` in the web app).
- **Moving, renaming or deleting** existing files or folders. Exception: deleting files you created earlier in the same task.
- Putting a file somewhere the table above doesn't cover.

**How to ask:** say what you want to add or move, why the current structure doesn't fit, the exact path you propose, and the alternatives. If the owner approves a structural change, update the README tree and this table in the same change, so the documented structure always matches the real one.

## 6. API endpoint verification (curl is mandatory)

Every endpoint you create or change must be **verified against the running stack with `curl` before you say it works.** Passing unit tests is not enough. The rule applies to every new route, and to any change in an existing route's behaviour, status codes or response shape.

1. **Rebuild and run the stack:** `docker compose up --build -d api` (or the whole stack). The API port is `API_PORT` in `.env`; the local default in this repo may differ from 8080 (check `.env`).
2. **Call it with `curl`** and show the command and the real response in your report. Use `-i` (or `-D -`) to see the status code and headers.
3. **Check the happy path**: the expected status code, the JSON shape and the actual values.
4. **Check the failure paths that apply**, each with its own `curl`:
   - `400` for invalid input, `404` for an unknown id, `409` or `422` for rule violations;
   - `401` without a session and `403` for the wrong role, once authentication exists. For role-scoped data, confirm another user's data returns `404`.
5. **Check error shape on every failure**: the body has a stable `code` and a `traceId` equal to the `X-Request-Id` header, and nothing internal leaks (no stack traces, SQL or class names).
6. **Check the contract:** the path appears in `GET /v3/api-docs`; regenerate `apps/api/openapi.json` and the web client (`make gen-api`), and make sure the drift check passes.
7. **Check real data:** values in responses must come from the database (consistent with a `psql` query), never hard-coded.
8. **Cover it permanently:** add an automated test, and add core endpoints to `scripts/smoke.sh`.
9. **Report honestly:** list each `curl` you ran with its status code and outcome. If you could not run an endpoint (stack down, port conflict), say so. Never write "works" or "verified" without curl evidence.

Example of the expected evidence:

```bash
curl -i http://localhost:8081/api/v1/reference/summary
# HTTP/1.1 200  {"outlets":120,"vehicles":60,...}
curl -i http://localhost:8081/api/v1/orders/999999
# HTTP/1.1 404  {"code":"NOT_FOUND","traceId":"...", ...}
```

## 7. UI rules

- **Figma is the source of truth for the UI.** Match the existing frames. Don't redesign screens that already exist.
- Use the design tokens (`packages/design-tokens`). No hex colours, spacing numbers or font stacks hard-coded in components.
- Build screens from shared components; avoid copy-pasted page markup.
- Every list or detail screen handles loading, empty, error and forbidden states. Field screens also handle offline.
- For screens without a Figma frame, compose from the existing design system and flag them for design review.

## 8. Quality and verification

- Run the relevant tests before saying something works. For any endpoint, also verify with `curl` (section 6). Report failures honestly, with the output.
- If something was skipped or couldn't be verified, say so plainly.
- Integration tests use real PostgreSQL (Testcontainers), not H2.
- Keep changes focused: don't reformat or refactor unrelated code in the same change.
- Match the style and naming of the surrounding code.

## 9. Git

- Never commit unless the owner asks. Never push unless the owner asks.
- Before committing, check `git status` for secrets, `.env` files and dataset files.
- Write simple, humanized, and descriptive commit messages that clearly explain what changed and why. **Do NOT mention internal phase numbers (e.g. avoid 'Phase 6', 'Phase 3A') in commit messages**, because phase numbers are unclear and meaningless to outside readers. State the actual capability, feature, or refinement (e.g. `feat(planning): implement trip-time and constraint validation engine`, `feat(auth): add quick demo login buttons for user roles`).
- One feature slice per branch, named descriptively like `feat/dispatcher-dashboard` or `feat/constraint-engine`.

## 10. Communication

- Explain decisions in plain language, and state assumptions.
- When unsure about intent, ask, especially before anything in section 2.
- Raise risks early (data exposure, competition rules, breaking changes) rather than working around them silently.
