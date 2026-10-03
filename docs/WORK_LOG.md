# Waypoint Work Log & Activity History

This log tracks all development work, implementation milestones, ad-hoc tasks, and UI refinements. It serves as an audit trail of changes made across the project.

---

## 2026-10-03

### 2. Fix Planning Bottom Action Bar Layout, Overflow and Active Depot Scoping
- **Category:** UI Layout & State Fixes
- **Summary:** Resolved text clipping, element overflow, and hardcoded volume fallback on the planning bottom action bar, and aligned active depot scoping between TopBar and PlanningConfirmedOrdersPage.
- **Details:**
  - **Fixed Token & Padding:** Replaced undefined `--space-14` CSS token across `ui.css` (which caused browser shorthand `padding` declarations to be invalidated and reset to 0) with valid `--space-16`. Set explicit `box-sizing: border-box` and generous `padding: var(--space-16) var(--space-32)` on `.planning-bottom-bar`.
  - **Eliminated Text Clipping:** Added `white-space: nowrap` on `.bottom-bar-metric` and `.bottom-bar-sub`, with `flex-wrap: wrap` on action buttons to prevent crowding. Set `.planning-page-container` padding-bottom to 0 so the sticky bar sits flush at the bottom.
  - **Removed Hardcoded Fallback:** Removed the hardcoded `vol || 412.5` fallback in `PlanningConfirmedOrdersPage.tsx`, so empty or filtered scopes show real 0.0 m³ volume instead of 412.5 m³.
  - **Depot Scoping Alignment:** Initialized `RoleShell` topbar select with `auth.user?.depot || 'Peliyagoda'`, mapped options directly with matching values, and set fallback to `Peliyagoda` when available so the page query matches the topbar selection and loads confirmed orders properly.
- **Files Modified:**
  - `apps/web/src/components/ui.css`
  - `apps/web/src/app/RoleShell.tsx`
  - `apps/web/src/features/ordering/PlanningConfirmedOrdersPage.tsx`

### 1. Complete 5-Step Planning Workflow Matching Figma (UI Implementation)
- **Category:** UI Implementation & Workflow Alignment
- **Summary:** Implemented the full end-to-end 5-step planning workflow matching every Figma frame (Steps 1 through 5, including split view, drawer, and modals) with complete interactivity, real backend data integration, and unit test coverage.
- **Details:**
  - **Step 1 (Confirmed Orders, Bulk Actions & Map Split View - Frames 1A, 1B, 1C):**
    - `Step1BulkActionBar.tsx`: Floating dark pill toolbar appearing when orders are selected (`[X orders selected]` | `[-] Exclude from plan` | `[+] Include` | `Move to Deferred` | `Export CSV` | `[✕]`).
    - Exclusion alert banner: Dismissible warning banner (`⊘ ORD-xxx excluded from plan · Undo`) with real-time recalculation of planned orders.
    - `Step1MapSplitView.tsx`: Integrated side-by-side Table/Map view mode with compact scrollable order cards on the left, interactive Colombo metropolitan vector map on the right, Peliyagoda depot badge, outlet clusters with order counts, map zoom controls, and active order detail popup card.
  - **Step 2 (Generate Plan & Optimization Status - Frames 2A, 2B):**
    - `PlanningStep2Generate.tsx`:
      - 2A (Configuration & In-Progress): 4 KPI summary tiles (Total Orders, Total Volume, Active Depots, Available Fleet), collapsible "Planning Options (Advanced)" accordion with algorithm mode, fresh delivery priorities, and driver break buffer toggles, animated delivery truck graphic with progress indicator, and planning summary with "What happens next?" step guide.
      - 2B (Plan Ready): Success banner ("Plan ready in 28 seconds (Optimised)"), 6 KPI metric tiles (Allocated Orders, Fleet Utilisation, On-Time Rate, Total Distance, Total Volume, Fresh Windows Met), route overview interactive canvas, and vehicle utilisation breakdown.
  - **Step 3 (Route Allocation, Drawer & Vehicle Switch - Frames 3A, 3C, 3D):**
    - `PlanningStep3Allocation.tsx`:
      - 3A (Allocation Overview): Vehicle type tabs (All, 4-Wheel, 6-Wheel), vehicle route cards with multi-metric utilisation bars (Volume, Weight, Time Budget, Fuel Quota, Fresh Window), interactive route inspector map with sequential stop pins and depot origin.
      - 3C (Route Review Drawer): Slide-out drawer displaying full vehicle manifest, driver info, and chronological stop sequence with delivery time windows.
      - 3D (Change Vehicle Modal): Modal displaying vehicle swap options with compatibility badges, capacity comparisons, and instant re-assignment.
  - **Step 4 (Exceptions Triage & Resolution - Frames 4A, 4A+, 4B):**
    - `PlanningStep4Exceptions.tsx`:
      - 4A (Triage Dashboard): Decision banner with resolution progress bar, category filter pills (All, Time Window, Access, Capacity), constraint violation triage cards with severity badges, affected outlets, violation details, and one-click suggested resolutions ("Split delivery across 2 vehicles", "Shift delivery window").
      - 4A+ (Defer Order Modal): Modal with defer reason selection, next run date picker, notification toggle, and warning about customer notifications.
      - 4B (All Resolved Celebration): Circular animated checkmark, confetti effect, 4 resolution outcome KPIs (Resolved Violations, Deferrals, Average Delay, Fleet Compliance), and chronological audit log of actions taken.
  - **Step 5 (Confirm & Send Dispatch - Frames 5A, 5A+, 5B):**
    - `PlanningStep5Confirm.tsx`:
      - 5A (Dispatch Manifest): Ready to send banner, 5 dispatch KPI tiles, comprehensive vehicle manifest table with driver assignment, total orders, volume, distance, departure times, and driver/store notification toggles.
      - 5A+ (Send Confirmation Modal): Modal summarizing routes, drivers, and delivery promises with irreversible publish warning and direct confirmation action.
      - 5B (Plan Sent & Locked Status): Floating dark notification toast ("Plan successfully sent to drivers and store managers"), live execution milestone timeline with timestamps, and locked route overview map with live driver GPS tracker preview.
  - **Visual Design & Design Tokens:**
    - Added comprehensive styling in `apps/web/src/components/ui.css` using existing design tokens for all cards, progress bars, badges, modals, drawers, and animations.
    - Updated `PlanningStages.tsx` with green checkmarks `✓` for completed steps and brand-yellow active bar indicator.
  - **Automated Testing & Build:**
    - Created unit tests in `apps/web/src/features/planning/PlanningSteps.test.tsx` verifying all 5 steps render, transition forward and backward, open modals/drawers, and perform bulk actions.
    - Verified all 63 Vitest tests pass across all 12 test files (`pnpm test`).
    - Verified TypeScript type check passes without errors (`pnpm typecheck`).
    - Verified production build completes cleanly (`pnpm build`).
- **Files Added:**
  - `apps/web/src/features/planning/Step1BulkActionBar.tsx`
  - `apps/web/src/features/planning/Step1MapSplitView.tsx`
  - `apps/web/src/features/planning/PlanningStep2Generate.tsx`
  - `apps/web/src/features/planning/PlanningStep3Allocation.tsx`
  - `apps/web/src/features/planning/PlanningStep4Exceptions.tsx`
  - `apps/web/src/features/planning/PlanningStep5Confirm.tsx`
  - `apps/web/src/features/planning/PlanningSteps.test.tsx`
- **Files Modified:**
  - `apps/web/src/features/ordering/PlanningConfirmedOrdersPage.tsx`
  - `apps/web/src/features/planning/PlanningStages.tsx`
  - `apps/web/src/components/ui.css`

---

## 2026-10-02

### 1. Planning UI Redesign Matching Figma (UI Refinement & Alignment)
- **Category:** UI Alignment & Refinement
- **Summary:** Redesigned the Planning workspace to match the Figma reference design exactly: horizontal 5-step card stepper, single depot switcher in the topbar, screen-fitting 10-row table, and persistent sticky bottom action bar.
- **Details:**
  - Redesigned `PlanningStageTabs` in `PlanningStages.tsx` from standard buttons to a 5-step horizontal card stepper with top accent lines (brand yellow for active, light gray for inactive), circular step badges, bold active titles, and clickable stage transitions.
  - Eliminated the duplicate depot selector from the planning body toolbar card so the depot selector appears only once in the TopBar (`[warehouse icon] Peliyagoda Depot v`).
  - Added the Figma-matched Planning header: `Planning` title, subtitle (`Peliyagoda Depot · Orders closed 16:00 · 7 late orders moved to the next run`), and top-right delivery date card button (`Tomorrow` / `26 Jun 2026 (Fri)`) with integrated picker.
  - Redesigned the orders section card matching Figma: toolbar with search input, filters button, and Table/Map toggle; filter pills (`All orders`, `Normal`, `Refrigerated`, `Van only`) with live counts and active yellow styling.
  - Compacted the order table to 10 rows per page (`size: 10`) with scrollable viewport container (`max-height: 480px; overflow-y: auto;`) and numeric pagination (`< 1 2 3 ... 9 >`), eliminating excessive page height.
  - Formatted order rows with dual-line outlet display (`Waypoint Fresh Dehiwala` / `🟢 OUT034 · Dehiwala`), delivery window, volume, refrigerated/normal badges, skipped flag, and toggle switches.
  - Added persistent sticky bottom action bar (`position: sticky; bottom: 0;`) displaying live total orders & volume (`85 orders · 42.5 m³`), exclusion count, snapshot controls, and large brand-yellow `✨ Generate Plan →` action button directly clickable without scrolling.
- **Files Modified:**
  - `apps/web/src/features/ordering/PlanningConfirmedOrdersPage.tsx`
  - `apps/web/src/features/planning/PlanningStages.tsx`
  - `apps/web/src/app/RoleShell.tsx`
  - `apps/web/src/components/shell.css`
  - `apps/web/src/components/ui.css`

### 2. Curved Yellow Active Shelf & Collapsible Sidebar (UI Refinement)
- **Category:** UI Refinement & Polish
- **Summary:** Implemented custom curved yellow shelf active indicator with smooth sliding animations, collapsible sidebar, and refined geometry matching Figma screenshots.
- **Details:**
  - Implemented the curved yellow active shelf: left rounded pill (`border-radius: 999px 0 0 999px`) connected to a 14px vertical yellow strip on the right rail edge.
  - Added top and bottom concave corner curve SVGs mathematically continuous with the yellow rail strip and active pill.
  - Added smooth sliding transition (`transform: translateY(...)` with `cubic-bezier(0.4, 0, 0.2, 1)`) moving the active yellow shelf and curved cutouts dynamically across nav items.
  - Implemented collapsed sidebar mode (72px compact rail): brand logo collapses to `waypoint-mark.png`, labels hide with accessible tooltips, and icons stay centered with active curved yellow pill.
  - Removed horizontal divider borders across `.brand` and `.sidebar-footer` so the yellow vertical connector strip remains uninterrupted and seamless.
  - Fixed "All systems operational" card padding in `.sidebar-footer` (`padding-right: calc(14px + var(--space-8))`) to eliminate overlap with the yellow strip.
  - Positioned the Exceptions notification badge `3` inward (`margin-inline-end: var(--space-28)`) so it sits comfortably to the left of the curve.
  - Replaced collapsed sidebar emblem `waypoint-mark.png` with user-provided high-resolution mark (yellow location pin + winding road ribbon), cleanly extracting transparency for seamless rendering on dark theme.
  - Added accessible collapse toggle button with state persistence in `localStorage`.
  - Added comprehensive unit tests in `components.test.tsx` verifying collapse toggle, badge rendering, and keyboard accessibility.
- **Files Modified:**
  - `apps/web/src/components/Sidebar.tsx`
  - `apps/web/src/components/shell.css`
  - `apps/web/src/components/waypoint-mark.png`
  - `apps/web/src/app/roles.ts`
  - `apps/web/src/components/components.test.tsx`

### 2. Quick Demo Role Login Buttons (Additional Task / Testing Aid)
- **Category:** Ad-hoc Testing Aid & UI Refinement
- **Summary:** Added 4 quick-fill demo buttons to the login card for the 4 core roles (Dispatcher, Store Manager, Loader, Driver).
- **Details:**
  - Clicking any role button instantly populates `USER ID` and `PASSWORD` fields.
  - Configured Vite `envDir` and `envPrefix` to read demo credentials directly from the root `.env` (`VITE_SEED_*` or `SEED_*`).
  - Added active state highlight and accessible tags for each role.
  - Verified all 4 roles authenticate with HTTP 200 against the live backend API.
- **Files Modified:**
  - `apps/web/src/features/auth/LoginPage.tsx`
  - `apps/web/src/features/auth/auth.css`
  - `apps/web/src/features/auth/auth.test.tsx`
  - `apps/web/vite.config.ts`
  - `.env.example`
  - `docker-compose.yml`
  - `infrastructure/docker/web.Dockerfile`

### 2. Trip-Time & Constraint Engine (Plan Milestone)
- **Category:** Core Planning Engine
- **Summary:** Implemented pure domain models, calculations, independent validator, and constraint rules R1–R12.
- **Details:**
  - Created domain types: `PlanContext`, `PlanTrip`, `PlanOrder`, `PlanVehicle`, `PlanStop`, `PlanMetrics`.
  - Implemented calculations: `TripTimeCalculator`, `ArrivalCalculator` (recurrence timing), `DistanceFuelCalculator`, `PlanMetricsCalculator`.
  - Implemented rules R1–R12: temperature compatibility, trip capacity, time budget, fuel quota, depot affinity, delivery window, same brand district, vehicle access, trip count, vehicle availability, operating day, and whole order.
  - Implemented independent `PlanValidator` with structured `ConstraintViolation` reports.
  - Added diagnostic test suite with S1 diagnostic fixture test.
  - Created shared React planning UI components: `UtilisationBar`, `ConstraintChip`, `ViolationCard`, `PlanMetricsSummary`.
- **Files Added / Modified:**
  - `apps/api/src/main/java/lk/techtrithalon/waypoint/planning/domain/**`
  - `apps/api/src/test/java/lk/techtrithalon/waypoint/planning/domain/**`
  - `apps/web/src/components/ConstraintChip.tsx`
  - `apps/web/src/components/PlanMetricsSummary.tsx`
  - `apps/web/src/components/UtilisationBar.tsx`
  - `apps/web/src/components/ViolationCard.tsx`
  - `apps/web/src/components/planning-components.test.tsx`

### 3. Full-Stack Verification & Depot Scoping
- **Category:** Architecture & Verification
- **Summary:** Completed end-to-end verification of Phase 0-5 requirements with strict depot scoping and CSRF protection.
- **Details:**
  - Enforced depot-scoped ordering queries and mutations for Store Managers and Dispatchers.
  - Verified automated database migrations and reference data ingestion.
  - Rebuilt containers and verified all API endpoints using `curl`.
- **Documentation:**
  - `docs/PHASE0_5_COMPLETION_VERIFICATION.md`

---

## 2026-10-03 — Manual planning functionality and verification

- Reviewed prior completion logs and related code, then verified the existing constraint engine: 56 domain tests passed, including 101/112/213 fixtures. Earlier visual/hosted CI sign-off and Phase 6 master-checkbox reconciliation were not reopened or silently closed.
- Added candidate plan/trip/stop/disposition persistence through an additive Flyway migration, immutable snapshot adaptation, server-computed times/distance/fuel/utilisation, per-plan assignment uniqueness and optimistic edits.
- Added dispatcher create/read/list/replace, trip creation/removal, whole-order assignment/moves/removal, vehicle/slot changes, resequencing, manual deferral/restoration and minimal atomic publication. Failed validation writes nothing; publication reloads persisted assignments and rechecks snapshot, whole-order accounting, availability and weekly fuel.
- Added shared transaction locks for availability/fuel publication, fuel reservation and published ordering service transitions. Publication audit failure rolls back plan/order/fuel state together. Published plans are immutable; fairness and full publication version lifecycle stay in later milestones.
- Regenerated OpenAPI/client with distinct ManualPlan request schemas; added typed query hooks and a functional shared-component board at `/dispatcher/manual-planning`, linked from the dashboard. The parallel session's existing Step 1–5 components and styles were preserved; board composition is flagged for design review.
- Verification: complete API suite 110 passed (after including new tables in the seed test cleanup); complete web suite 66 passed using one worker, typecheck, focused lint and production build passed. Initial concurrent web run timed out in two existing tests; both passed in the complete rerun without changing timeout limits.
- Real-stack verification: isolated synthetic Compose API 18082; updated smoke passed; 77 curl outcomes recorded, including per-route 401/403/404 guards, named-rule rejections and successful publication with Python stopped. PostgreSQL matched one planned order, one explicitly deferred order and 4.00 L committed fuel. Main database and parallel agent's running API were not modified.
- Final input guard rejects null entries in replacement arrays with 400; the seven manual-plan integration tests and OpenAPI generation test passed again after adding this coverage. Rebuilt the final API image, verified both malformed requests with curl, regenerated the client and passed the contract drift check.
- Browser: fresh isolated API 18083/web 15175 with Python stopped; complete create/assign/reject/defer/publish/reload path passed. Initial test tried changing the intentionally workspace-locked depot; corrected the assertion and reran successfully.
- Evidence and integration limits: [MANUAL_PLANNING_VERIFICATION.md](./MANUAL_PLANNING_VERIFICATION.md). Dashboard planned/progress summaries still retain their earlier unavailable-state contract; the manual board metrics are authoritative.
- The owner requested a commit of this work. Only the manual-planning changes and this log entry are included; the parallel session's UI changes remain uncommitted. No push was requested.
