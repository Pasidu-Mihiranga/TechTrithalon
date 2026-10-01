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
- **Scope changes**: building features outside the current phase, or skipping a phase's exit gate.

Small, local, reversible changes inside the current task (a bug fix, a test, a component in the agreed design) do not need approval.

## 3. Work in the agreed order

1. Follow the [implementation plan](docs/IMPLEMENTATION_PLAN.md) phase order and exit gates. **Current UI priority: Dispatcher and Store Manager first (Phase 3A); Loader and Driver later.**
2. **Do only what was asked.** If the owner asks for structure only, create structure only. Don't implement ahead.
3. Work in **vertical slices**: migration → Spring → OpenAPI → generated client → UI → tests. A feature is done only when it meets the plan's definition of done.
4. Mark a plan checkbox only with evidence (a test run, a PR, a running screen). Never mark something done that wasn't verified.

## 4. Architecture guardrails

- **Spring Boot owns all operational state.** Python (`apps/intelligence`) receives what it needs in the request and returns a result. It never gets database credentials and never writes orders, plans, deliveries or users.
- **The validator is independent of the planner.** No plan is published without Spring re-checking every hard constraint.
- **Machine-learning predictions never override hard constraints.**
- **Schema changes go through Flyway only.** Name migrations with a timestamp: `VYYYYMMDD_HHMM__description.sql`.
- **The API contract is generated.** After changing an endpoint, regenerate `apps/api/openapi.json` and the TypeScript client. Never hand-edit generated files.
- **Modules talk through published services or events**, never through another module's repository. Cross-module references are by ID, not JPA associations.
- **Business time is Asia/Colombo.** Use the injected `Clock`; never call `now()` directly in business code.
- **Driver clients**: a PWA (web) and a React Native Expo app (`apps/mobile`) share offline logic in `packages/field-core`. Don't duplicate sync logic in either app.

## 5. UI rules

- **Figma is the source of truth for the UI.** Match the existing frames. Don't redesign screens that already exist.
- Use the design tokens (`packages/design-tokens`). No hex colours, spacing numbers or font stacks hard-coded in components.
- Build screens from shared components; avoid copy-pasted page markup.
- Every list or detail screen handles loading, empty, error and forbidden states. Field screens also handle offline.
- For screens without a Figma frame, compose from the existing design system and flag them for design review.

## 6. Quality and verification

- Run the relevant tests before saying something works. Report failures honestly, with the output.
- If something was skipped or couldn't be verified, say so plainly.
- Integration tests use real PostgreSQL (Testcontainers), not H2.
- Keep changes focused: don't reformat or refactor unrelated code in the same change.
- Match the style and naming of the surrounding code.

## 7. Git

- Never commit unless the owner asks. Never push unless the owner asks.
- Before committing, check `git status` for secrets, `.env` files and dataset files.
- Write short, descriptive commit messages that explain what changed and why.
- One feature slice per branch, named like `feat/phase-3a-dispatcher-dashboard`.

## 8. Communication

- Explain decisions in plain language, and state assumptions.
- When unsure about intent, ask, especially before anything in section 2.
- Raise risks early (data exposure, competition rules, breaking changes) rather than working around them silently.
