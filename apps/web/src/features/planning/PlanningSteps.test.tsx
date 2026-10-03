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
      expect(screen.getByRole('heading', { name: 'Plan #701 Frozen (Revision 2)' })).toBeInTheDocument()
    })

    it('keeps the candidate unready when creation fails', async () => {
      renderWithClient(<PlanningStep2Generate snapshot={null} orderCount={2} totalVolume={3}
        chilledCount={0} activeDepot="Synthetic depot" onContinueToAllocation={vi.fn()}
        onGeneratePlan={vi.fn().mockResolvedValue(false)} />)
      await userEvent.click(screen.getByRole('button', { name: /generate delivery plan/i }))
      expect(await screen.findByText(/candidate could not be created/i)).toBeInTheDocument()
      expect(screen.queryByText('Planning Snapshot Frozen')).not.toBeInTheDocument()
    })

    it('renders 2A configuration and advances to 2B plan ready upon generation', async () => {
      const onContinue = vi.fn()
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
          onContinueToAllocation={onContinue}
          onGeneratePlan={onGeneratePlan}
        />
      )

      expect(screen.getAllByText('Selected orders')[0]).toBeInTheDocument()
      expect(screen.getByText('85')).toBeInTheDocument()
      expect(screen.getByText('Planning Summary')).toBeInTheDocument()

      const generateBtn = screen.getByRole('button', { name: /generate delivery plan/i })
      await userEvent.click(generateBtn)

      expect(onGeneratePlan).toHaveBeenCalled()

      // Ready banner appears
      expect(await screen.findByText('Planning Snapshot Frozen')).toBeInTheDocument()
      expect(screen.getByText('Review allocation')).toBeInTheDocument()

      const reviewBtn = screen.getByRole('button', { name: /review allocation/i })
      await userEvent.click(reviewBtn)
      expect(onContinue).toHaveBeenCalled()
    })
  })

  describe('Step 3 Review Allocation', () => {
    it('renders vehicle allocation cards and opens stop sequence drawer and swap modal', async () => {
      const onBack = vi.fn()
      const onContinue = vi.fn()

      const syntheticRoutes = [
        {
          id: 'VEH001',
          type: 'Reefer 5T',
          badge: 'Reefer' as const,
          region: 'Colombo North',
          tripsSummary: '2 trips · 84 km',
          volume: { used: 22.5, total: 26.4, unit: 'm³' },
          weight: { used: 3400, total: 5500, unit: 'kg' },
          accentColor: '#FFC20E',
          stops: [
            {
              seq: 1,
              ref: 'ORD-101',
              outletName: 'Waypoint Fresh Peliyagoda',
              window: '06:00–07:30',
              volume: '3.2 m³',
              brand: 'Fresh',
            },
          ],
        },
      ]

      renderWithClient(
        <PlanningStep3Allocation
          routes={syntheticRoutes}
          activeDepot="Peliyagoda"
          onBackToSummary={onBack}
          onContinueToExceptions={onContinue}
        />
      )

      expect(screen.getByText('VEH001')).toBeInTheDocument()
      expect(screen.getByText('Reefer 5T')).toBeInTheDocument()

      // Open drawer
      const reviewBtn = screen.getByRole('button', { name: /review/i })
      await userEvent.click(reviewBtn)

      expect(screen.getByText('VEH001 Delivery Sequence')).toBeInTheDocument()
      expect(screen.getByText('Waypoint Fresh Peliyagoda')).toBeInTheDocument()

      // Close drawer
      await userEvent.click(screen.getByRole('button', { name: /close sequence review/i }))

      // Open swap modal
      const changeVehBtn = screen.getByRole('button', { name: /change/i })
      await userEvent.click(changeVehBtn)

      expect(screen.getByText('Change Vehicle for Route')).toBeInTheDocument()

      // Close modal
      await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

      // Continue to step 4
      const continueBtn = screen.getByRole('button', { name: /proceed to exceptions/i })
      await userEvent.click(continueBtn)
      expect(onContinue).toHaveBeenCalled()
    })
  })

  describe('Step 4 Resolve Exceptions', () => {
    it('renders exceptions triage and transitions to 4B celebration when all resolved', async () => {
      const onContinue = vi.fn()

      const syntheticExceptions = [
        {
          id: 'ex-1',
          ref: 'ORD-501',
          outletName: 'Waypoint Fresh Rajagiriya',
          flag: 'Van only',
          window: '08:00–10:00',
          volume: '3.5 m³',
          violationTitle: 'Van-only parking access',
          violationDescription: 'Outlet road forbids 5T lorries.',
          suggestedFix: 'Re-assign to Van VEH055',
          fixActionLabel: 'Reassign to Van',
          category: 'van' as const,
          status: 'open' as const,
        },
      ]

      renderWithClient(
        <PlanningStep4Exceptions
          exceptions={syntheticExceptions}
          onContinueToConfirm={onContinue}
        />
      )

      expect(screen.getByRole('heading', { level: 2, name: /dispatcher decision/i })).toBeInTheDocument()
      expect(screen.getByText('Van-only parking access:')).toBeInTheDocument()

      // Apply fix
      const applyFixBtn = screen.getByRole('button', { name: /reassign to van/i })
      await userEvent.click(applyFixBtn)

      // Check 4B celebration state
      expect(screen.getByText('All Exceptions Resolved')).toBeInTheDocument()
      expect(screen.getByText('Resolution Audit Trail')).toBeInTheDocument()

      const nextBtn = screen.getByRole('button', { name: /continue to confirm & send/i })
      await userEvent.click(nextBtn)
      expect(onContinue).toHaveBeenCalled()
    })
  })

  describe('Step 5 Confirm & Send', () => {
    it('reports an unavailable publication service without showing success', async () => {
      renderWithClient(<PlanningStep5Confirm activeDepot="Synthetic depot" planDate="Synthetic day" manifestRows={[{ vehicle: 'SYN-V', driver: 'Unassigned', stops: 1, volume: '1 m³', departs: '—', bay: 'Unassigned' }]} />)
      await userEvent.click(screen.getByRole('button', { name: /confirm & send plan/i }))
      await userEvent.click(screen.getByRole('button', { name: /yes, send delivery plan/i }))
      expect(await screen.findByText(/publication service is unavailable/i)).toBeInTheDocument()
      expect(screen.queryByText('Delivery plan is locked and active')).not.toBeInTheDocument()
    })

    it('keeps a rejected publication in the confirmation dialog', async () => {
      renderWithClient(<PlanningStep5Confirm activeDepot="Synthetic depot" planDate="Synthetic day"
        manifestRows={[{ vehicle: 'SYN-V', driver: 'Unassigned', stops: 1, volume: '1 m³', departs: '—', bay: 'Unassigned' }]}
        onPublishPlan={vi.fn().mockRejectedValue(new Error('Publication rejected by validator'))} />)
      await userEvent.click(screen.getByRole('button', { name: /confirm & send plan/i }))
      await userEvent.click(screen.getByRole('button', { name: /yes, send delivery plan/i }))
      expect(await screen.findByText('Publication rejected by validator')).toBeInTheDocument()
      expect(screen.queryByText('Delivery plan is locked and active')).not.toBeInTheDocument()
    })

    it('renders manifest table and notification toggles, opens send modal, and displays 5B sent timeline', async () => {
      const syntheticManifest = [
        {
          vehicle: 'VEH001',
          driver: 'Sunil Silva',
          stops: 8,
          volume: '22.5 m³',
          departs: '04:30',
          bay: 'Bay 1',
          accentColor: '#FFC20E',
        },
      ]

      renderWithClient(
        <PlanningStep5Confirm
          activeDepot="Peliyagoda"
          planDate="26 Jun 2026 (Fri)"
          manifestRows={syntheticManifest}
          onPublishPlan={vi.fn().mockResolvedValue(undefined)}
        />
      )

      expect(screen.getByText('Delivery plan is ready to send')).toBeInTheDocument()
      expect(screen.getByText('Vehicle Manifest')).toBeInTheDocument()
      expect(screen.getByText('Sunil Silva')).toBeInTheDocument()

      // Open confirmation modal
      const sendBtn = screen.getByRole('button', { name: /confirm & send plan/i })
      await userEvent.click(sendBtn)

      expect(screen.getByText('Confirm and Send Plan')).toBeInTheDocument()

      // Confirm send
      const modalConfirmBtn = screen.getByRole('button', { name: /yes, send delivery plan/i })
      await userEvent.click(modalConfirmBtn)

      // Check 5B sent state
      expect(screen.getByText('Delivery plan is locked and active')).toBeInTheDocument()
      expect(screen.getByText('Plan published by Dispatcher')).toBeInTheDocument()
      expect(screen.getByText('Locked Routes Overview · Peliyagoda Depot')).toBeInTheDocument()
    })
  })
})
