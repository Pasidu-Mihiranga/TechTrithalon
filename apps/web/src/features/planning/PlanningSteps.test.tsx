import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Step1BulkActionBar } from './Step1BulkActionBar'
import { PlanningStep2Generate } from './PlanningStep2Generate'
import { PlanningStep3Allocation } from './PlanningStep3Allocation'
import { PlanningStep4Exceptions } from './PlanningStep4Exceptions'
import { PlanningStep5Confirm } from './PlanningStep5Confirm'

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
    it('renders 2A configuration and advances to 2B plan ready upon generation', async () => {
      const onContinue = vi.fn()
      const onGeneratePlan = vi.fn().mockResolvedValue(undefined)

      render(
        <PlanningStep2Generate
          snapshot={null}
          orderCount={186}
          totalVolume={412.5}
          chilledCount={32}
          activeDepot="Peliyagoda Depot"
          onContinueToAllocation={onContinue}
          onGeneratePlan={onGeneratePlan}
        />
      )

      expect(screen.getByRole('heading', { name: 'Generate Delivery Plan' })).toBeInTheDocument()
      expect(screen.getByText('186')).toBeInTheDocument()
      expect(screen.getByText('Planning Summary')).toBeInTheDocument()

      const generateBtn = screen.getByRole('button', { name: /generate delivery plan/i })
      await userEvent.click(generateBtn)

      expect(onGeneratePlan).toHaveBeenCalled()

      // Wait for 2B ready state
      const readyBanner = await screen.findByText('Plan ready in 28 seconds', {}, { timeout: 3000 })
      expect(readyBanner).toBeInTheDocument()
      expect(screen.getByText('Optimised')).toBeInTheDocument()
      expect(screen.getByText('1,126 km')).toBeInTheDocument()
      expect(screen.getByText('87%')).toBeInTheDocument()

      const reviewBtn = screen.getByRole('button', { name: /review allocation/i })
      await userEvent.click(reviewBtn)
      expect(onContinue).toHaveBeenCalled()
    })
  })

  describe('Step 3 Review Allocation', () => {
    it('renders vehicle allocation cards and opens stop sequence drawer and swap modal', async () => {
      const onBack = vi.fn()
      const onContinue = vi.fn()

      render(
        <PlanningStep3Allocation
          onBackToSummary={onBack}
          onContinueToExceptions={onContinue}
        />
      )

      expect(screen.getByText('VEH014')).toBeInTheDocument()
      expect(screen.getByText('VEH021')).toBeInTheDocument()
      expect(screen.getByText('Sort: utilisation')).toBeInTheDocument()

      // Open drawer
      const viewStopsBtn = screen.getAllByRole('button', { name: /view stops sequence/i })[0]
      await userEvent.click(viewStopsBtn)

      expect(screen.getByText('STOPS ON THIS ROUTE')).toBeInTheDocument()
      expect(screen.getByText('Fort Bazaar Wholesale')).toBeInTheDocument()

      // Open swap modal from drawer
      const changeVehBtn = screen.getAllByRole('button', { name: /change vehicle/i })[0]
      await userEvent.click(changeVehBtn)

      expect(screen.getByText('COMPATIBLE VEHICLES NEARBY')).toBeInTheDocument()
      expect(screen.getByText('Compatible · Recommended')).toBeInTheDocument()

      // Confirm change
      const confirmSwapBtn = screen.getByRole('button', { name: /confirm change/i })
      await userEvent.click(confirmSwapBtn)

      // Continue to step 4
      const continueBtn = screen.getByRole('button', { name: /continue to exceptions/i })
      await userEvent.click(continueBtn)
      expect(onContinue).toHaveBeenCalled()
    })
  })

  describe('Step 4 Resolve Exceptions', () => {
    it('renders exceptions triage and transitions to 4B celebration when all resolved', async () => {
      const onContinue = vi.fn()

      render(<PlanningStep4Exceptions onContinueToConfirm={onContinue} />)

      expect(screen.getByText(/orders still need a decision/i)).toBeInTheDocument()
      expect(screen.getAllByText('Van-only access').length).toBeGreaterThan(0)

      // Accept all suggestions
      const acceptAllBtn = screen.getByRole('button', { name: /accept all suggestions/i })
      await userEvent.click(acceptAllBtn)

      // Check 4B celebration state
      expect(screen.getByText('All exceptions resolved')).toBeInTheDocument()
      expect(screen.getByText('Resolution log')).toBeInTheDocument()

      const nextBtn = screen.getByRole('button', { name: /continue to confirm & send/i })
      await userEvent.click(nextBtn)
      expect(onContinue).toHaveBeenCalled()
    })
  })

  describe('Step 5 Confirm & Send', () => {
    it('renders manifest table and notification toggles, opens send modal, and displays 5B sent timeline', async () => {
      render(
        <PlanningStep5Confirm
          activeDepot="Peliyagoda Depot"
          planDate="29 Sep 2026 (Tue)"
        />
      )

      expect(screen.getByText("Ready to send tomorrow's plan")).toBeInTheDocument()
      expect(screen.getByText('Vehicle manifests')).toBeInTheDocument()
      expect(screen.getByText('Kasun Perera')).toBeInTheDocument()

      // Open confirmation modal
      const sendBtn = screen.getByRole('button', { name: /send plan to loaders/i })
      await userEvent.click(sendBtn)

      expect(screen.getByText('Send plan to loader?')).toBeInTheDocument()
      expect(screen.getByText(/185 orders · 410.5 m³ across 15 vehicles/i)).toBeInTheDocument()

      // Confirm send
      const modalConfirmBtn = screen.getByRole('button', { name: /send to loader/i })
      await userEvent.click(modalConfirmBtn)

      // Check 5B sent state
      expect(screen.getByText('Plan sent to loader')).toBeInTheDocument()
      expect(screen.getByText('Plan locked and sent')).toBeInTheDocument()
      expect(screen.getByText('Tomorrow at a glance')).toBeInTheDocument()
      expect(screen.getByText('Locked')).toBeInTheDocument()
    })
  })
})
