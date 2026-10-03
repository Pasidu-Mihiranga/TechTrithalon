import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { Step1BulkActionBar } from './Step1BulkActionBar'
import { PlanningStep2Generate } from './PlanningStep2Generate'
import { PlanningStep3Allocation } from './PlanningStep3Allocation'
import { PlanningStep4Exceptions } from './PlanningStep4Exceptions'
import { PlanningStep5Confirm } from './PlanningStep5Confirm'

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('Planning Steps UI Components', () => {
  describe('Step 1B Bulk Action Bar', () => {
    it('renders selected count and invokes action callbacks', async () => {
      const onExclude = vi.fn()
      const onInclude = vi.fn()
      const onMoveToDeferred = vi.fn()
      const onExportCsv = vi.fn()
      const onClearSelection = vi.fn()

      const { rerender } = render(
        <Step1BulkActionBar
          selectedCount={0}
          onExclude={onExclude}
          onInclude={onInclude}
          onMoveToDeferred={onMoveToDeferred}
          onExportCsv={onExportCsv}
          onClearSelection={onClearSelection}
        />
      )

      expect(screen.queryByRole('toolbar')).toBeNull()

      rerender(
        <Step1BulkActionBar
          selectedCount={3}
          onExclude={onExclude}
          onInclude={onInclude}
          onMoveToDeferred={onMoveToDeferred}
          onExportCsv={onExportCsv}
          onClearSelection={onClearSelection}
        />
      )

      expect(screen.getByRole('toolbar')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('orders selected')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /exclude from plan/i }))
      expect(onExclude).toHaveBeenCalledTimes(1)

      await userEvent.click(screen.getByRole('button', { name: /include/i }))
      expect(onInclude).toHaveBeenCalledTimes(1)

      await userEvent.click(screen.getByRole('button', { name: /clear selection/i }))
      expect(onClearSelection).toHaveBeenCalledTimes(1)
    })
  })

  describe('Step 2 Generate Plan', () => {
    it('shows a saved candidate when it arrives after the component mounts', () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const props = { snapshot: null, orderCount: 2, totalVolume: 3, chilledCount: 0,
        activeDepot: 'Synthetic depot', onContinueToAllocation: vi.fn(), onGeneratePlan: vi.fn() }
      const { rerender } = render(<QueryClientProvider client={client}><PlanningStep2Generate {...props} /></QueryClientProvider>)
      rerender(<QueryClientProvider client={client}><PlanningStep2Generate {...props}
        candidateView={{ plan: { id: 701, lockVersion: 2, status: 'candidate' } }} /></QueryClientProvider>)
      expect(screen.getByRole('heading', { name: 'Candidate #701 created (revision 2)' })).toBeInTheDocument()
    })

    it('keeps the candidate unready when creation fails', async () => {
      renderWithClient(<PlanningStep2Generate snapshot={null} orderCount={2} totalVolume={3}
        chilledCount={0} activeDepot="Synthetic depot" onContinueToAllocation={vi.fn()}
        onGeneratePlan={vi.fn().mockResolvedValue(false)} />)
      await userEvent.click(screen.getByRole('button', { name: /generate delivery plan/i }))
      expect(await screen.findByText(/candidate could not be created/i)).toBeInTheDocument()
      expect(screen.queryByText('Planning Snapshot Frozen')).not.toBeInTheDocument()
    })

    it('waits for the saved candidate before showing the ready state', async () => {
      const onGeneratePlan = vi.fn().mockResolvedValue(undefined)

      renderWithClient(
        <PlanningStep2Generate
          snapshot={{
            id: 101,
            planDate: '2026-06-26',
            depot: 'Peliyagoda',
            selectionMode: 'all',
            orderCount: 85,
            contentHash: 'abc123hash',
          }}
          orderCount={85}
          totalVolume={42.5}
          chilledCount={24}
          activeDepot="Peliyagoda"
          onContinueToAllocation={vi.fn()}
          onGeneratePlan={onGeneratePlan}
        />
      )

      expect(screen.getAllByText('Orders in scope')[0]).toBeInTheDocument()
      expect(screen.getByText('85')).toBeInTheDocument()
      expect(screen.getByText('Planning Summary')).toBeInTheDocument()

      const generateBtn = screen.getByRole('button', { name: /generate delivery plan/i })
      await userEvent.click(generateBtn)

      expect(onGeneratePlan).toHaveBeenCalled()

      expect(screen.queryByText('Planning Snapshot Frozen')).not.toBeInTheDocument()
      expect(screen.queryByText('Review allocation')).not.toBeInTheDocument()
    })
  })

  describe('Step 3 Review Allocation', () => {
    it('builds vehicle cards from the candidate trips and opens the stop sequence', async () => {
      const onBack = vi.fn()
      const onContinue = vi.fn()

      // Shaped like the server's ManualPlanView: one trip on a reefer, plus an idle standby vehicle.
      const candidateView = {
        plan: { id: 12, lockVersion: 4, status: 'candidate' },
        trips: [{
          id: 55, tripIndex: 1, vehicleId: 'VEH001', brand: 'Fresh', district: 'Colombo North',
          tripMinutes: 180, distanceKm: 84, fuelLitres: 12,
          stops: [{
            stopIndex: 1, orderId: 101, plannedArrival: '06:15:00',
            order: {
              id: 101, orderRef: 'ORD-101', outletId: 'OUT-101', district: 'Colombo North',
              brand: 'Fresh', temp: 'chilled', volumeM3: 3.2,
              effectiveWindowOpen: '06:00:00', effectiveWindowClose: '07:30:00',
            },
          }],
        }],
        fleet: [
          { vehicleId: 'VEH001', type: 'truck', temp: 'reefer', weightCapKg: 5500, volumeCapM3: 26.4 },
          { vehicleId: 'VEH002', type: 'van', temp: 'ambient', weightCapKg: 1200, volumeCapM3: 6 },
        ],
        utilisation: { 55: { volumeUsedM3: 22.5, volumeLimitM3: 26.4, weightUsedKg: 3400, weightLimitKg: 5500 } },
        vehicleUtilisation: {},
        unassignedOrders: [],
        validation: { feasible: true, violations: [], metrics: {} },
      } as never

      renderWithClient(
        <PlanningStep3Allocation
          candidateView={candidateView}
          onApplyCommand={vi.fn()}
          activeDepot="Peliyagoda"
          onBackToSummary={onBack}
          onContinueToExceptions={onContinue}
        />
      )

      // The trip vehicle and the standby vehicle both come from the candidate's frozen fleet.
      expect(screen.getByRole('article', { name: 'Vehicle VEH001' })).toBeInTheDocument()
      expect(screen.getByRole('article', { name: 'Vehicle VEH002' })).toBeInTheDocument()
      expect(screen.getByText(/Trip 1 · 1 stop · 180 min · 84 km/)).toBeInTheDocument()
      expect(screen.getByText('Van (Standby)')).toBeInTheDocument()

      // Open the stop sequence for the planned trip.
      await userEvent.click(screen.getAllByRole('button', { name: /^review$/i })[0])
      expect(screen.getByText('VEH001 Delivery Sequence')).toBeInTheDocument()
      expect(screen.getAllByText('OUT-101 · Colombo North').length).toBeGreaterThan(0)
      await userEvent.click(screen.getByRole('button', { name: /close sequence review/i }))

      // With a candidate loaded the trip is editable; the standby vehicle offers a new trip instead.
      expect(screen.getByRole('button', { name: /^change$/i })).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /add trip/i }).length).toBeGreaterThan(0)
      expect(screen.queryByText('Open a candidate plan to edit trips')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /proceed to exceptions/i }))
      expect(onContinue).toHaveBeenCalled()
    })
  })

  describe('Step 4 Resolve Exceptions', () => {
    /** Minimal candidate shaped like the server's ManualPlanView. */
    const candidate = (overrides: Record<string, unknown>) => ({
      plan: { id: 12, lockVersion: 4, status: 'candidate' },
      trips: [],
      unassignedOrders: [],
      validation: { feasible: false, violations: [], metrics: {} },
      ...overrides,
    }) as never

    it('lists the server violations and unassigned orders that need a decision', async () => {
      const onApplyCommand = vi.fn()

      renderWithClient(
        <PlanningStep4Exceptions
          candidateView={candidate({
            validation: {
              feasible: false,
              metrics: {},
              violations: [{
                ruleCode: 'VAN_ONLY_PARKING', entityType: 'ORDER', entityId: '501',
                message: 'Outlet road forbids 5T lorries.', allowedValue: 'van', actualValue: 'truck',
              }],
            },
            unassignedOrders: [
              { order: { id: 502, orderRef: 'ORD-502', outletId: 'OUT-77', temp: 'chilled', volumeM3: 3.5 } },
            ],
          })}
          onApplyCommand={onApplyCommand}
          onContinueToConfirm={vi.fn()}
        />
      )

      // Both the hard violation and the unscheduled order are open decisions.
      expect(screen.getByRole('heading', { level: 2, name: /2 exceptions require dispatcher decision/i })).toBeInTheDocument()
      expect(screen.getByText('VAN_ONLY_PARKING:')).toBeInTheDocument()
      // The server message is the row's subject and its explanation.
      expect(screen.getAllByText(/Outlet road forbids 5T lorries\./).length).toBeGreaterThan(0)
      expect(screen.getByText('Unassigned Order:')).toBeInTheDocument()
      expect(screen.getByText('ORD-502')).toBeInTheDocument()

      // Nothing is resolved on screen without a server round trip.
      expect(screen.queryByText('All Exceptions Resolved')).not.toBeInTheDocument()
      expect(onApplyCommand).not.toHaveBeenCalled()
    })

    it('filters by the category derived from the rule code', async () => {
      renderWithClient(
        <PlanningStep4Exceptions
          candidateView={candidate({
            validation: {
              feasible: false,
              metrics: {},
              violations: [
                { ruleCode: 'VAN_ONLY_PARKING', entityType: 'ORDER', entityId: '501', message: 'Van only.' },
                { ruleCode: 'VEHICLE_CAPACITY_VOLUME', entityType: 'TRIP', entityId: '9', message: 'Over volume.' },
              ],
            },
          })}
          onContinueToConfirm={vi.fn()}
        />
      )

      await userEvent.click(screen.getByRole('button', { name: /van access/i }))
      expect(screen.getByText('VAN_ONLY_PARKING:')).toBeInTheDocument()
      expect(screen.queryByText('VEHICLE_CAPACITY_VOLUME:')).not.toBeInTheDocument()
    })

    it('shows the resolved state from the server verdict, with the deferral audit trail', async () => {
      const onContinue = vi.fn()
      const onApplyCommand = vi.fn()

      renderWithClient(
        <PlanningStep4Exceptions
          candidateView={candidate({
            validation: { feasible: true, violations: [], metrics: { vehiclesUsed: 7, tripsUsed: 9 } },
            unassignedOrders: [{
              order: { id: 502, orderRef: 'ORD-502', outletId: 'OUT-77', volumeM3: 3.5 },
              disposition: 'DEFERRED', reason: 'Outlet closed for stocktake', nextDeliveryDate: '2026-06-27',
            }],
          })}
          onApplyCommand={onApplyCommand}
          onContinueToConfirm={onContinue}
        />
      )

      expect(screen.getByText('All Exceptions Resolved')).toBeInTheDocument()
      // Counts and the fleet tile come from the server's validation metrics, not the rendered rows.
      expect(screen.getByText('7')).toBeInTheDocument()
      expect(screen.getByText('9 trips planned')).toBeInTheDocument()

      expect(screen.getByText('Resolution Audit Trail')).toBeInTheDocument()
      expect(screen.getByText(/Outlet closed for stocktake/)).toBeInTheDocument()
      expect(screen.getByText(/Next: 2026-06-27/)).toBeInTheDocument()

      // Restoring sends the candidate's own lock version back to the server.
      await userEvent.click(screen.getByRole('button', { name: /restore/i }))
      expect(onApplyCommand).toHaveBeenCalledWith(expect.objectContaining({
        operation: 'restore', orderId: 502, body: expect.objectContaining({ expectedVersion: 4 }),
      }))

      await userEvent.click(screen.getByRole('button', { name: /continue to confirm & send/i }))
      expect(onContinue).toHaveBeenCalled()
    })
  })

  describe('Step 5 Confirm & Send', () => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    /** Route the plan list and the changes read; the list decides which version is current. */
    const serve = (changesBody: unknown, runPlans: unknown[]) => vi.fn(async (request: Request) =>
      json(new URL(request.url).pathname.endsWith('/changes') ? changesBody : runPlans))
    const basePlan = {
      id: 12, snapshotId: 3, planDate: '2026-06-26', depot: 'Synthetic', version: 2, status: 'candidate', lockVersion: 3,
      createdBy: 1, createdAt: '2026-06-25T11:00:00Z', updatedAt: '2026-06-25T11:00:00Z', basedOnPlanId: 11, trips: [], dispositions: [],
    }
    const metrics = { ordersAssigned: 1, vehiclesUsed: 1, assignedVolumeM3: 1.25, totalDistanceKm: 20, totalFuelLitres: 4 }
    const changes = {
      planId: 12, version: 2, basePlanId: 11, baseVersion: 1, firstVersion: false,
      summary: { added: 0, removed: 1, moved: 0, resequenced: 0, unchanged: 1, tripsAdded: 0, tripsRemoved: 1, driversChanged: 0 },
      orders: [
        { orderId: 2, orderRef: 'SYN002', outletId: 'OUT902', change: 'REMOVED', before: { vehicleId: 'VEH901', tripIndex: 2, seq: 1 }, after: null },
        { orderId: 1, orderRef: 'SYN001', outletId: 'OUT901', change: 'UNCHANGED', before: { vehicleId: 'VEH901', tripIndex: 1, seq: 1 }, after: { vehicleId: 'VEH901', tripIndex: 1, seq: 1 } },
      ],
      trips: [{ vehicleId: 'VEH901', tripIndex: 1, change: 'UNCHANGED', driverBefore: 'Synthetic driver', driverAfter: 'Synthetic driver' }],
    }
    const candidate = {
      plan: basePlan, validation: { violations: [], feasible: true, metrics },
      trips: [{ id: 5, vehicleId: 'VEH901', tripIndex: 1, brand: 'Fresh', district: 'Alpha', tripMinutes: 31, distanceKm: 20, fuelLitres: 4,
        stops: [{ id: 0, orderId: 1, stopIndex: 1, plannedArrival: '04:00:00', serviceStart: '05:00:00' }] }],
      unassignedOrders: [{ order: { id: 2, orderRef: 'SYN002' }, disposition: 'DEFERRED', reason: 'Closed', notifyStore: true, protectNextRun: true }],
      fleet: [], utilisation: { 5: { volumeUsedM3: 1.25, volumeLimitM3: 25, weightUsedKg: 240, weightLimitKg: 5000, volumeUtilisationPct: 5, stopCount: 1 } },
      vehicleUtilisation: {}, fairness: {}, published: [],
    }
    const publishedTrip = { tripId: 5, vehicleId: 'VEH901', tripIndex: 1, brand: 'Fresh', district: 'Alpha', plannedDepart: '03:30:00',
      tripMinutes: 31, distanceKm: 20, fuelLitres: 4, driverUserId: 4, driverName: 'Synthetic driver', loadTaskId: 9, loadStatus: 'pending',
      stops: [{ orderId: 1, seq: 1, plannedArrival: '04:00:00', serviceStart: '05:00:00' }] }

    it('reports an unavailable publication service without showing success', async () => {
      vi.stubGlobal('fetch', serve(changes, [{ plan: { id: 11, version: 1, status: 'published' } }]))
      // A candidate is on screen but no publication handler is wired, so sending must fail loudly.
      renderWithClient(<PlanningStep5Confirm activeDepot="Synthetic depot" planDate="Synthetic day"
        candidateView={candidate as never} />)
      await userEvent.click(screen.getByRole('button', { name: /confirm & send plan/i }))
      await userEvent.click(screen.getByRole('button', { name: /yes, send delivery plan/i }))
      expect(await screen.findByText(/publication service is unavailable/i)).toBeInTheDocument()
    })

    it('keeps a rejected publication in the confirmation dialog', async () => {
      vi.stubGlobal('fetch', serve(changes, [{ plan: { id: 11, version: 1, status: 'published' } }]))
      renderWithClient(<PlanningStep5Confirm activeDepot="Synthetic depot" planDate="Synthetic day"
        candidateView={candidate as never}
        onPublishCandidate={vi.fn().mockRejectedValue(new Error('Publication rejected by validator'))} />)
      await userEvent.click(screen.getByRole('button', { name: /confirm & send plan/i }))
      await userEvent.click(screen.getByRole('button', { name: /yes, send delivery plan/i }))
      expect(await screen.findByText('Publication rejected by validator')).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('shows a revision with the server-computed changes, the driver publication assigns and what sending does', async () => {
      vi.stubGlobal('fetch', serve(changes, [{ plan: { id: 11, version: 1, status: 'published' } }]))
      const publish = vi.fn().mockResolvedValue(undefined)
      renderWithClient(<PlanningStep5Confirm activeDepot="Synthetic" planDate="26 Jun" candidateView={candidate as never} onPublishCandidate={publish} />)
      expect(screen.getByText('Revision 2 is ready to send')).toBeInTheDocument()
      expect(await screen.findByText('Changes from version 1')).toBeInTheDocument()
      expect(screen.getByText('1 removed')).toBeInTheDocument()
      expect(screen.getByText('Removed (deferred)')).toBeInTheDocument()
      expect(screen.getByText('SYN002')).toBeInTheDocument()
      expect(screen.getByText('Synthetic driver')).toBeInTheDocument()
      expect(screen.getByText(/Replaces version 1/)).toBeInTheDocument()
      expect(screen.getByText(/notifies 1 store/)).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /confirm & send plan/i }))
      await userEvent.click(screen.getByRole('button', { name: /yes, send delivery plan/i }))
      expect(publish).toHaveBeenCalledTimes(1)
      vi.unstubAllGlobals()
    })

    it('shows a published version from frozen values and starts a revision', async () => {
      vi.stubGlobal('fetch', serve({ ...changes, firstVersion: true, basePlanId: null, baseVersion: null }, []))
      const revise = vi.fn().mockResolvedValue(undefined)
      const published = { ...candidate, plan: { ...basePlan, status: 'published', publishedAt: '2026-06-25T11:05:00Z', ruleVersion: 'booklet-v1' }, published: [publishedTrip] }
      renderWithClient(<PlanningStep5Confirm activeDepot="Synthetic" planDate="26 Jun" candidateView={published as never} onRevise={revise} />)
      expect(screen.getByText('Version 2 sent to the dock')).toBeInTheDocument()
      expect(screen.getByText('Drivers assigned to 1 of 1 trips')).toBeInTheDocument()
      expect(screen.getByText('Waiting for the loader')).toBeInTheDocument()
      expect(screen.getByText('First vehicle departs')).toBeInTheDocument()
      expect(screen.getAllByText('03:30').length).toBeGreaterThan(0)
      expect(screen.getByText('pending')).toBeInTheDocument()
      expect(screen.queryByText(/SMS delivered/)).toBeNull()
      await userEvent.click(screen.getByRole('button', { name: /revise this plan/i }))
      expect(revise).toHaveBeenCalledWith('published')
      vi.unstubAllGlobals()
    })

    it('refuses to send a candidate based on a version that is no longer current', async () => {
      vi.stubGlobal('fetch', serve(changes, [{ plan: { id: 13, version: 3, status: 'published' } }, { plan: { id: 11, version: 1, status: 'superseded' } }]))
      const open = vi.fn()
      renderWithClient(<PlanningStep5Confirm activeDepot="Synthetic" planDate="26 Jun" candidateView={candidate as never} onOpenPlan={open} />)
      expect(await screen.findByText(/version 3 was published after this candidate was created/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /confirm & send plan/i })).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: 'Open version 3' }))
      expect(open).toHaveBeenCalledWith(13)
      vi.unstubAllGlobals()
    })

    it('marks a replaced version and links to the current one', async () => {
      vi.stubGlobal('fetch', serve(changes, []))
      const open = vi.fn()
      const replaced = { ...candidate, plan: { ...basePlan, status: 'superseded', publishedAt: '2026-06-25T11:05:00Z',
        supersededAt: '2026-06-25T11:30:00Z', supersededByPlanId: 13, ruleVersion: 'booklet-v1' },
        published: [{ ...publishedTrip, loadStatus: 'superseded' }] }
      renderWithClient(<PlanningStep5Confirm activeDepot="Synthetic" planDate="26 Jun" candidateView={replaced as never} onRevise={vi.fn()} onOpenPlan={open} />)
      expect(screen.getByText('Version 2 (replaced)')).toBeInTheDocument()
      expect(screen.getByText('Load tasks withdrawn')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /revise this plan/i })).toBeNull()
      await userEvent.click(screen.getByRole('button', { name: /open the current version/i }))
      expect(open).toHaveBeenCalledWith(13)
      vi.unstubAllGlobals()
    })
  })
})
