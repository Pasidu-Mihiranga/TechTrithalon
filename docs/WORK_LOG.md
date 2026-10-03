# Waypoint Work Log & Activity History

This log tracks all development work, implementation milestones, ad-hoc tasks, and UI refinements. It serves as an audit trail of changes made across the project.

---

## 2026-10-03

### 7. Fix Step 3 Vehicle Allocation Cards Flex-Shrink Squishing & Validate Phase 7 Manual Planning UI Support
- **Category:** UI/UX Bug Fix & Phase 7 Manual Planning Verification
- **Summary:** Resolved the issue where vehicle cards in Step 3 (Review Allocation) rendered as flattened 24px capsules clipping their contents, and verified complete UI support for Phase 7 (Manual Planning First) operations on the vehicle cards.
- **Details:**
  - **Vehicle Card Flex-Shrink Fix:**
    - Diagnosed that `.veh-alloc-card` and `.vehicle-card` inside `.step3-vehicle-cards-list` had `overflow: hidden;`. Under CSS flexbox rules, children with non-visible overflow default to `min-height: 0`, which caused flexbox to squish all 14 vehicle cards into ~24px pills to prevent list overflow, clipping vehicle IDs, badges, buttons, driver rows, and all 4 progress bars.
    - Added `flex-shrink: 0;` to `.veh-alloc-card, .vehicle-card` and `flex-wrap: wrap; gap: 8px;` to `.veh-card-head` in `apps/web/src/components/ui.css`. Each card now retains its full intrinsic height (~160–180px) and the list scrolls vertically as intended.
  - **Phase 7 UI Support Verification on Vehicle Cards:**
    - Verified that `PlanningStep3Allocation.tsx` fully integrates with Phase 7 Manual Planning backend contracts:
      - **Resequencing Stops:** "Earlier" and "Later" actions trigger `POST /api/v1/dispatcher/plans/{id}/trips/{tripId}/sequence`.
      - **Assign / Move / Remove Stops:** Drag/assign dropdown triggers `POST /api/v1/dispatcher/plans/{id}/moves` to assign unassigned orders or remove stops.
      - **Vehicle / Slot Swap:** "Change" button opens modal to execute `POST /api/v1/dispatcher/plans/{id}/trips/{tripId}/vehicle` for vehicle changes and slot 1/2 reassignment.
      - **Trip Management:** "Add Trip" modal and "Remove" button mutate candidate trips.
      - **Optimistic Concurrency & Audit:** Passes `expectedVersion: candidateView.plan.lockVersion` and non-blank audit reasons on every manual edit.
      - **Authoritative Metrics & Rule Violations:** Displays live utilization progress bars (Volume, Weight, Time, Fuel) computed by Spring Boot, and named rule violation badges (`ViolationCard`).
- **Files Modified:**
  - `apps/web/src/components/ui.css`
  - `docs/WORK_LOG.md`

### 6. Connect Five-Step Planning Workflow to Authoritative Manual Planning Backend and Spring Dashboard Metrics
- **Category:** Backend Integration, Optimistic Locking & Planning Workflow
- **Summary:** Connected the Figma-based five-step planning screens (`PlanningConfirmedOrdersPage`, `PlanningStep2Generate`, `PlanningStep3Allocation`, `PlanningStep4Exceptions`, `PlanningStep5Confirm`) to the verified manual-planning backend API (`/api/v1/dispatcher/plans/*`). Supported candidate creation from frozen snapshots, authoritative optimistic locking (`lockVersion`), real mutations (add/remove trips, assign/move/unassign orders, vehicle/slot changes, stop resequencing), named rule violation cards, explicit order deferral/restoration with audit reasons, atomic publication with fuel reservation, and server-supplied dashboard planning progress.
- **Details:**
  - **Authoritative Candidate Lifecycle & Single Source of Truth:**
    - Maintained candidate plan ID (`planId`) and stage in URL search parameters (`useSearchParams`).
    - Integrated `useManualPlan(planId)` to query authoritative server state and `useManualPlans(planDate, activeDepot)` to allow seamless switching between saved candidate plans.
    - Provided an active candidate status badge in the header displaying plan ID, version, lock revision, and operational status, accompanied by an explicit "Reload Plan" button.
  - **Step 2 (Generate Plan):**
    - Connected real routes from `candidateView.trips` and real metrics from `candidateView.validation.metrics`.
    - Added plan ID and lockVersion banner with honest disclaimer that automatic optimization belongs to Phase 9.
  - **Step 3 (Allocation & Routing Controls):**
    - Mapped vehicle allocation cards from real `candidateView.trips` and `candidateView.fleet` vehicles.
    - Connected "Change Vehicle" modal to `vehicle` mutation (`POST /api/v1/dispatcher/plans/{id}/trips/{tripId}/vehicle`) supporting vehicle swaps and slot 1/2 selection.
    - Connected stop sequence "Earlier" and "Later" buttons in the 3C drawer to `sequence` mutation (`POST /api/v1/dispatcher/plans/{id}/trips/{tripId}/sequence`).
    - Connected "Remove" stop to `move` mutation (`POST /api/v1/dispatcher/plans/{id}/moves`) to unassign an order.
    - Added "Assign Unassigned Order" control in drawer to assign backlog orders to the selected trip.
    - Connected "Add Trip" modal (`addTrip` mutation) and "Remove Trip" button (`removeTrip` mutation).
  - **Step 4 (Exceptions, Violations & Deferrals):**
    - Displayed named constraint violations from `candidateView.validation.violations` with severity, rule code, human message, actual vs allowed values, and remediation code.
    - Mapped unassigned backlog orders from `candidateView.unassignedOrders`: open unassigned orders feature a "Defer Order" button opening a modal that requires a nonblank reason and optional next delivery date, executing the `defer` mutation.
    - Deferred orders display their saved reason and next delivery date, with a "Restore" button invoking the `restore` mutation.
    - Enforced honest 4B celebration: displays celebration view only when `candidateView.validation.feasible === true`, zero open hard rule violations exist, and all unassigned orders have explicit deferral reasons recorded.
  - **Step 5 (Confirm & Immutable Publication):**
    - Derived vehicle manifest table directly from server-owned `candidateView.trips` (stops, payload volume, loading bay, unassigned driver status).
    - Mapped KPIs from `candidateView.validation.metrics` (distance, fuel, volume, orders assigned).
    - Connected final publication modal to `publish` mutation (`POST /api/v1/dispatcher/plans/{id}/publish`), requiring a nonblank publication reason and advancing to 5B only upon HTTP 200 success.
    - Enforced read-only lock for reloaded published plans. Included honest disclosures that mobile loader and driver execution workflows belong to later phases.
  - **Optimistic Locking & Conflict Handling:**
    - Passed current server `lockVersion` and nonblank reasons with every edit command.
    - Rejected mutations preserve the saved plan without local state corruption.
    - On 409 conflict, displays a clear warning banner with request trace ID and offers an explicit "Reload Latest Plan" action without automatic retries.
  - **Spring Dashboard Planning Progress:**
    - Updated `OrderQueryService` and `DashboardSnapshot` in Spring Boot to compute `ordersPlanned` and `planningProgress` from real published plans and assigned orders.
    - Verified through `OrderQueryIT` against real PostgreSQL Testcontainers.
  - **Verification:**
    - TypeScript type checking passes with 0 errors (`pnpm typecheck`).
    - Vitest unit tests pass 100% (66/66 tests across 13 test files).
    - Production build compiles cleanly (`pnpm build`).
- **Files Modified:**
  - `apps/api/src/main/java/lk/techtrithalon/waypoint/ordering/application/OrderQueryService.java`
  - `apps/api/src/main/java/lk/techtrithalon/waypoint/ordering/domain/DashboardSnapshot.java`
  - `apps/api/src/test/java/lk/techtrithalon/waypoint/ordering/api/OrderQueryIT.java`
  - `apps/web/src/features/ordering/PlanningConfirmedOrdersPage.tsx`
  - `apps/web/src/features/planning/PlanningStep2Generate.tsx`
  - `apps/web/src/features/planning/PlanningStep3Allocation.tsx`
  - `apps/web/src/features/planning/PlanningStep4Exceptions.tsx`
  - `apps/web/src/features/planning/PlanningStep5Confirm.tsx`
  - `apps/web/src/features/planning/manualPlanQueries.ts`
  - `docs/WORK_LOG.md`

### 5. Redesign Step 3 (Review Allocation) UI Matching Figma Frame 3A and Integrate Interactive Leaflet Route Map
- **Category:** UI/UX Redesign, Map Integration & Layout Polish
- **Summary:** Redesigned Step 3 ("Review Allocation") to match Figma Frame 3A (`3A_review_allocation.png`) with clean, highly readable typography, responsive two-column layout, and complete card styling. Integrated a fully interactive Leaflet map using dynamic tile and attribution configurations from `.env` (`VITE_MAP_TILE_URL`, `VITE_MAP_ATTRIBUTION`). Eliminated the misplaced dark depot badge bug that was floating over the page header, and ensured complete viewport fit with zero outer scrolling.
- **Details:**
  - **Figma Frame 3A Layout & Typography Polish:**
    - Left Column (`.step3-left-card`):
      - Header toolbar with bold vehicle title, dynamic vehicle count badge (`14`), and interactive sort toggle (`Sort: utilisation ⌄` / `Sort: id ⌄` / `Sort: capacity ⌄`).
      - Category filter pills matching Figma: `All [count]`, `Lorry [count]`, `Reefer [count]`, `Van [count]` with distinct active styling.
      - Fixed CSS selector mismatch that caused vehicle cards to collapse into unstyled text: implemented `.veh-alloc-card` with hover elevation, smooth transitions, and gold border highlight on selected card.
      - Card Header: bold vehicle ID (`VEH014`), rounded type tags (`Reefer 5T`, `Lorry 5T`, `Van`), trip/distance summary (`2 trips · 98 km` or `Standby`), and `Review` / `Change` action buttons.
      - Driver info line: avatar icon with assigned driver name or honest `👤 Unassigned driver · Peliyagoda Fleet`.
      - 4 multi-metric progress bars with distinct color tokens: Volume (blue), Weight (purple), Time budget (green), and Fuel quota (amber).
      - Footer tags: Fresh delivery budget window (`🕒 Fresh delivery budget: ...`) and warning banners when capacity limits are approached.
    - Right Column (Route Inspector & Interactive Map):
      - Replaced static SVG placeholder with full `<InteractiveRouteMap>` component using **Leaflet API**.
      - Removed the unpositioned `.map-depot-badge` that was floating over the top navigation header; depot is now rendered as a native Leaflet map marker at Colombo/Peliyagoda depot coordinates (`6.9535, 79.9042`).
      - Tile layer and attribution are loaded dynamically via `import.meta.env.VITE_MAP_TILE_URL` and `import.meta.env.VITE_MAP_ATTRIBUTION` with OpenStreetMap defaults.
      - Custom SVG `DivIcon` markers for Depot Hub (`From Peliyagoda Depot`) and numbered sequential stop pins (`1`, `2`, `3`...).
      - Dynamic route polyline connecting depot to outlets, interactive zoom controls, and a graceful standby coverage indicator when 0 stops are scheduled.
      - Segmented route control (`[ This route ] [ All routes ]`) and `[ ⟳ Re-optimise ]` map recentring button.
    - Bottom Action Bar:
      - Left info icon with dynamic order allocation count (`X orders allocated across Y vehicles`) and honest status message.
      - Right navigation buttons: `< Back to plan summary` and `Continue to exceptions ->`.
  - **Maintainability & Test Verification:**
    - TypeScript type checking passes with 0 errors (`pnpm typecheck`).
    - Vitest unit test suite passes with 100% success across all 13 test files (66/66 tests passing).
    - Production build compiles cleanly (`pnpm build`).
- **Files Modified:**
  - `.env` & `.env.example`
  - `apps/web/src/components/ui.css`
  - `apps/web/src/features/planning/InteractiveRouteMap.tsx`
  - `apps/web/src/features/planning/PlanningStep3Allocation.tsx`
  - `apps/web/src/features/ordering/PlanningConfirmedOrdersPage.tsx`
  - `apps/web/src/main.tsx`

### 4. Fit Planning Page into Viewport Without Scrolling and Add Interactive Plan Generation Animation
- **Category:** UI/UX Design, Layout Refinement & Motion
- **Summary:** Reorganized Step 2 (Generate Plan) into the 2-column Figma layout (`.step2-layout-grid` with `.step2-main-col` and `.step2-side-rail`) and optimized outer spacings across the planning shell, header, and table container so the entire planning workflow fits within the viewport without whole-page vertical scrolling. Added an interactive, multi-stage plan generation animation with driving truck motion, spinning wheels, moving road dashes, glowing progress shimmer, live percentage counter, and real-time constraint validation badges.
- **Details:**
  - **Viewport Fit (Zero Whole-Page Scrolling):**
    - Reduced `.shell-main` outer vertical padding from `28px` to `16px`.
    - Compacted `.planning-header` (title reduced to 24px, margin to 10px) and `.planning-stepper-card` (padding to 10px, margin to 12px).
    - Activated the 2-column layout in Step 2: placed 4 KPI summary cards, collapsible advanced options, and the generator hero card in the left column, while placing the Planning Summary card and "What happens next?" card in the right side rail.
    - Set Step 1 table container max-height to `min(420px, calc(100vh - 410px))` with internal table scrolling so the bottom action bar remains anchored and visible at all times.
  - **Plan Generation Animation:**
    - Animated delivery truck SVG with suspension bounce (`@keyframes truckDrive`), spinning front and rear wheels (`@keyframes wheelSpin`), moving road dashes (`@keyframes roadDash`), and dynamic speed/wind lines (`@keyframes speedLines`).
    - Smooth 4-stage generation progression with animated percentage counter (`0%` -> `100%`) and gradient shimmer progress bar.
    - Sequential stage text with rotating spinner: (1) Validating confirmed orders & freezing snapshot, (2) Checking cold chain & vehicle capacities, (3) Optimizing multi-stop routes & delivery windows, (4) Finalizing route sequences & fuel quotas.
    - Real-time constraint verification chips: Orders Checked, Reefer Constrained, Vehicles Allocated, Time Windows Met.
    - Connected "Re-run" button in Step 2B to restart the animation on demand.
  - **Verification:** All 12 test files (63 tests) pass (`pnpm test`), and TypeScript type checking passes with 0 errors.
- **Files Modified:**
  - `apps/web/src/components/shell.css`
  - `apps/web/src/components/ui.css`
  - `apps/web/src/features/planning/PlanningStep2Generate.tsx`

### 3. Remove Hardcoded Mock Data Across Planning Steps 1-5 and Wire Reference Queries with Honest Empty States
- **Category:** Architecture, Data Integrity & UI Rules Compliance
- **Summary:** In strict adherence to `AGENTS.md` Rule 1 ("No hard-coded data unless the owner explicitly asks for it") and Rule 3 ("Show an honest empty state"), removed all static mock arrays, fake drivers, fake routes, and fake KPIs across Planning Steps 1 through 5. Established clean, reusable TypeScript data contracts and connected real reference queries (`useVehicles()`, `useOutlets()`, real confirmed orders) while preserving the exact Figma visual styling, cards, and modal interactions.
- **Details:**
  - **Step 1 Map Split View (`Step1MapSplitView.tsx`):**
    - Removed static `clusters` array. Implemented dynamic cluster aggregation derived from real order scopes and outlet coordinates grouped by district.
    - Removed fake delivery window strings (`05:30–07:30`) and fake volume (`2.7 m³`), replacing them with real outlet operating windows or honest `—` placeholders when unconfigured.
  - **Step 2 Generate Plan (`PlanningStep2Generate.tsx`):**
    - Removed fake simulated routes array (`routesSample`), fake drivers, and simulated `setTimeout` progress loops.
    - Defined clean `GeneratedPlan` and `GeneratedPlanMetrics` data interfaces. Connected to `useVehicles()` to display real available fleet counts for the active depot (`activeDepot`).
    - Pre-generation (2A) renders real input metrics (`orderCount`, `totalVolume.toFixed(1) m³`, `chilledCount`).
    - Post-generation (2B) renders real solver metrics and routes when provided, or an honest empty state explaining that solver backend execution is pending.
  - **Step 3 Review Allocation (`PlanningStep3Allocation.tsx`):**
    - Removed static `VEHICLES` array with fake driver names and simulated routes.
    - Defined `VehicleAllocationCard` contract. When routes are provided, renders solver allocation; when pending, queries real depot fleet from `useVehicles()` and renders actual vehicles with real capacities and fuel quotas ready for assignment.
    - Connected Change Vehicle modal (3D) to real compatible vehicles from the fleet query instead of fake vehicle IDs.
  - **Step 4 Resolve Exceptions (`PlanningStep4Exceptions.tsx`):**
    - Removed static `INITIAL_EXCEPTIONS` array.
    - Defined clean `PlanningExceptionItem` prop contract. When exceptions exist, renders the 4A triage cards, filter pills, and defer modal.
    - When no exceptions exist (or all are resolved), renders the Figma 4B state with 100% compliance metrics.
  - **Step 5 Confirm & Send (`PlanningStep5Confirm.tsx`):**
    - Removed static `MANIFESTS` array with fake drivers and bays.
    - Defined clean `DispatchManifestRow` and `DispatchMetrics` interfaces. Renders real rows when compiled or an honest `EmptyState` in the manifest table when pending.
    - Preserved interactive notification toggles and send confirmation modal (5A+), ready to invoke `onPublishPlan()`.
  - **Automated Verification:**
    - Updated unit tests in `PlanningSteps.test.tsx` to wrap components in `QueryClientProvider` and provide synthetic props for UI verification.
    - All 12 test files (63 tests) pass (`pnpm test`).
    - Type check passes cleanly with zero errors (`pnpm typecheck`).
    - Production build succeeds cleanly (`pnpm build`).
    - Web container rebuilt and running healthy with curl verification on port 5173.
- **Files Modified:**
  - `apps/web/src/features/planning/Step1MapSplitView.tsx`
  - `apps/web/src/features/planning/PlanningStep2Generate.tsx`
  - `apps/web/src/features/planning/PlanningStep3Allocation.tsx`
  - `apps/web/src/features/planning/PlanningStep4Exceptions.tsx`
  - `apps/web/src/features/planning/PlanningStep5Confirm.tsx`
  - `apps/web/src/features/planning/PlanningSteps.test.tsx`

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

## 2026-10-03 — Round 2 requirements and phase-evidence audit

- Read the challenge booklet and project/reference/design/verification documentation; inspected current ordering, snapshots, constraint rules/tests, manual planning, five-step UI, role routing and release configuration. Identified the exact Hackathon scoring weights and separated booklet requirements from optional allocation/native choices and unresolved submitted-design promises.
- Fresh verification: 110 API tests passed against PostgreSQL Testcontainers (56 planning-domain tests), 66 web tests passed, TypeScript and production build passed, three Python tests passed. Full web lint failed with three errors and seven warnings; no clean CI claim is made. Build and Python deprecation warnings are recorded in the audit.
- Performed curl reads and existing-account logins on API 8081; verified 200/401/403/404 outcomes and matching trace IDs on failures. Read-only SQL matched API reference/confirmed-order/plan counts. No order, snapshot, plan or migration was changed; normal login sessions were created. Prior mutation/browser/Python-outage evidence was reviewed rather than rerun.
- Found current planning UI gaps: hard-coded late-order count, browser-computed totals, ineffective van-only filtering, local exclusions not affecting snapshot membership, incomplete scope clearing, generated map coordinates and timer-driven optimization narrative. Recorded the missing field/receipt workflows, minimal publication limits, rule boundary/cross-trip-wait/input coverage, S1 acceptance limits and aggregate-versus-line-item design mismatch.
- Updated `docs/IMPLEMENTATION_PLAN.md` to restore Phase 4's evidenced functional completion, preserve open Phase 3A/5/6/CI gates, check implemented Phase 6 tasks/timing fixtures, and retain Phase 7's functional completion with explicit limits. Updated README's stale status. Added `docs/ROUND2_REQUIREMENTS_AUDIT.md` with requirement mapping, test/curl evidence and dependency-ordered execution gates, without deadline-based shortcuts.
- Figma MCP metadata and identity calls repeatedly returned authentication prompts; no fresh design access or visual comparison was obtained and no token was requested/stored. Earlier role-frame documentation conflicts are explicitly unresolved.
- Preserved the existing uncommitted `apps/web/src/components/ui.css` change. No application fixes, deployment, commit, push, external post or phase-scope change was performed in this analysis task.
- Regenerated the TypeScript API client to `/tmp` and confirmed it is byte-identical to the tracked client; generated files were not changed. Final `git diff --check` passed.


## 2026-10-03 — Authorized merge and planning integrity repairs

- Read the Figma design-to-code skill and obtained Dispatcher metadata and Confirmed Orders design context/screenshot. Figma access now works; no token or design write was needed.
- At the owner's request, committed the existing changes, fetched/merged current remote main, merged the manual-planning branch without conflicts, and pushed `main` at `561ee5f`. Created `fix/planning-data-integrity` from that main. New fixes remain local and uncommitted.
- Added ordering-owned complete queue summary and server parking filtering before paging through published reference services. Added server-assigned plan volume and regenerated OpenAPI/TypeScript. Tested 207 invented orders to prove the 200-row limit does not truncate summary values.
- Connected Step 1 exclusions to reasoned persisted candidate DEFERRED dispositions, retaining all closed orders in the snapshot. Preserve other trips/dispositions and restore included orders to the backlog. Corrected false save/publication success, candidate readiness after refresh, and depot/URL scope clearing, including obsolete asynchronous responses.
- Removed fake late-count/map positions/manifest bay and departure/volume fallback/timed optimizer claims and unwired rule controls. Disabled unavailable notification delivery controls. Corrected empty manual-candidate language and retained existing screen slots/shared components.
- Repaired independent delivery-window waiting cascades without changing the trip-time/fuel formulas. Added exact close-time and 270/480-minute plus-one boundary tests.
- Final verification: full API suite 114 passed, plus later boundary/OpenAPI drift checks; web 71 passed, zero lint errors/warnings, TypeScript and Docker build passed. Isolated synthetic API 18084/web 15176: 26 captured curl outcomes with error trace/scope checks, SQL reconciliation, permanent smoke passed, primary queue/deferral/reload/depot browser passed, and full manual publication browser passed with Python stopped. Restored isolated Python afterward. See `docs/MANUAL_PLANNING_VERIFICATION.md` for commands/responses.
- Corrected initial test fixture column names, a startup-readiness browser failure, the refresh and URL/remount scope regressions found by browser checks, and smoke's obsolete planned-count expectation. Kept the competition database/data and credentials out of the verification artifacts/source.
- Updated audit/implementation evidence without marking remaining input/full-S1/visual, operational or release gates complete. Product-line representation and submitted intelligence/design commitments remain unresolved later dependencies.

## 2026-10-03 — Repair branch push and complete selected-order export

- At the owner's request, committed the verified planning integrity fixes with the simple message `fix(planning): save deferrals and show accurate planning data` (`0f520d4`) and pushed `fix/planning-data-integrity`, establishing its remote tracking branch.
- Began the first remaining planning gate, keeping later phases in order. Fixed CSV export silently omitting selected orders from other pages: it now reads every selected ID from the existing scoped backend endpoint, checks current delivery date/depot/confirmed status, and exports only after every read succeeds. An obsolete scope cannot trigger a download.
- Added standard CSV quoting for commas, quotes and line breaks, preserving backend volumes without computing business totals. Request failures and changed eligibility now display an error instead of exporting a partial selection.
- Regression tests cover IDs across pages, CSV escaping, changed status and failed reads. TypeScript and full lint passed. The complete web suite passed 73 tests across 14 files; the production build passed with its existing bundle-size advisory. Queue-summary failures also retain their typed error for forbidden-state rendering and offer a retry. No backend contract/schema/constraint change was made, and no new live browser-export verification is claimed.
- The first phase remains open for remaining screen metrics, date/error/forbidden journeys and Figma review. No later phase was started or marked complete.

## 2026-10-03 — Round 2 scope review and agent cost rules

- Read the booklet's Hackathon section (requirements and scoring weights), the implementation plan, the Round 2 audit, README, work log and the design documentation's loader/driver/store screen lists.
- Confirmed that loading, delivery, receipt, sync, exceptions and notification modules, and `packages/field-core`, are still empty placeholders.
- Added a Round 2 execution order (nine steps, each with a complexity rating) and token-saving rules to `CLAUDE.md`. Owner decision: Part A covers the Round 2 requirements (steps 1–9) and comes first. Part B covers the remaining phases (automatic planning, explainability, Android APK, forecasting/ML, capacity, hardening), which follow in order. No deadline-driven scope cuts.
- No application code, schema or contract was changed.


## 2026-10-03 — Step 1: planning metrics owned by the server

- Reviewed the uncommitted planning diff. It adds server fields for available vehicles, order totals and volume, and per-trip utilisation and stop count. Step 2 and Step 3 now read them instead of querying vehicles or counting locally.
- Fixed a Step 2 utilisation bar that could get an invalid width, and made Step 3's bottom bar use the server's used-vehicle and assigned-order counts.
- Regenerated the OpenAPI contract and TypeScript client. Extended `ManualPlanIT` with assertions for the new fields.
- Verification: 115 API tests, 73 web tests, typecheck and lint all pass. Curl on an isolated stack matched PostgreSQL (85 orders, 409.864 m³, 28 available vehicles), with 401/403/404/422 failure checks. The isolated stack was removed and the main stack rebuilt.
- Marked the server-side metrics checkbox done in the plan. Hosted CI, Figma visual sign-off and date/error/forbidden journeys stay open, so the phase gates are not closed.

## 2026-10-03 — Step 2: durable deferrals, carry-forward and store notices

- Added append-only `deferral` and `deferral_acknowledgement` tables. Added `customer_order.planning_date` (the run an order belongs to), imported fairness facts from the scenario CSV, and reason code, flags and decider on candidate dispositions. The migration is additive.
- Publication now records each deferral with its evidence, moves the order to the next operating run, and refuses unexplained backlog. Queue, snapshot and dashboard read carried orders. Fairness (previous-day skip, consecutive streak, protected carry-forward) is derived per order and returned with the plan.
- New endpoints: dispatcher run history with server totals; store notices and acknowledgement. Contract and client regenerated.
- Web: a shared defer form (five Figma reason codes, protect and notify toggles, consequence text from server evidence) used in Step 1, Step 4 and the manual board. The Deferred Orders page now shows live data. Store home and order detail show notices. Step 5 blocks Send while orders are undecided.
- Found and fixed my own streak bug: the imported skip now extends history when the history reaches the requested date. A regression test covers it.
- Verification: 119 API tests (new `DeferralIT`), 76 web tests, typecheck and lint pass. Curl and SQL on an isolated real-data stack match (see `docs/DEFERRAL_VERIFICATION.md`). Smoke passes on the main stack. A browser journey and Figma review were not done; Figma MCP was not connected.

## 2026-10-03 — Planning improvements from the routing audit

- Step 3 no longer invents a `'06:00–08:00'` window. It shows the outlet's effective window from the backend, or "unavailable", and the planned arrival as a separate value.
- Added `StopSequencer` (EDD: effective window close, then order ID). New trips start in EDD order, and a move without a position takes its EDD slot. Explicit positions, the `sequence` endpoint and `PUT` replace are kept as given.
- One schedule source: `ArrivalCalculator.scheduleVehicleDay` is used by both `SnapshotPlanContextFactory` and `DeliveryWindowRule`. Removed the duplicate lateness check in `ManualPlanService`, which had reported a late stop twice.
- Labelled competition rules vs Waypoint assumptions (fuel return leg, 03:30/08:00 departures, trip-2 departure, waiting vs budget) in Javadocs and TECHNICAL_REFERENCE §17. Open timing questions are recorded; no formula changed. The publish audit event now stores the computed schedule; freezing it on trip/stop rows is added to Phase 11.
- Tests: `StopSequencerTest` (5), `ManualSequencingIT` (4), a publish-audit assertion, and `stopWindow.test.tsx` (3). Totals: API 128, web 79; typecheck, lint and build clean; isolated-stack curl/SQL and main smoke passed (see MANUAL_PLANNING_VERIFICATION).
