import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { PlanningStep3Allocation } from './PlanningStep3Allocation'
import { ManualPlanRequestError, type ManualPlanView } from './manualPlanQueries'

const geography = { attribution: 'Synthetic test boundaries', depots: [{ name: 'Synthetic', lat: 7, lng: 80, basis: 'Synthetic point' }],
  districts: [{ district: 'Alpha', served: true, depot: 'Synthetic', labelPoint: [80.1, 7.1], geometry: { type: 'Polygon', coordinates: [[[80, 7], [80.3, 7], [80.3, 7.3], [80, 7.3], [80, 7]]] } }],
  links: [{ district: 'Alpha', depot: 'Synthetic', depotToDistrictKm: 10, depotToDistrictMinutes: 20, interStopKm: 3, interStopMinutes: 7, roadClass: 'urban' }] }
const answer = async (request: Request) => new Response(request.url.includes('/reference/geography') ? JSON.stringify(geography) : '[]', { status: 200, headers: { 'Content-Type': 'application/json' } })

const veh = (vehicleId: string, availabilityStatus: string | null, extra = {}) => ({
  vehicleId, type: 'truck', temp: 'ambient', weightCapKg: 3990, volumeCapM3: 21.1, depot: 'Synthetic', availabilityStatus, ...extra,
})

const view = {
  plan: { id: 801, lockVersion: 4, status: 'candidate' },
  trips: [{ id: 11, vehicleId: 'VEH901', tripIndex: 1, brand: 'Fresh', district: 'Alpha', tripMinutes: 49, distanceKm: 23, fuelLitres: 4.6, stops: [] }],
  fleet: [veh('VEH901', 'available', { temp: 'reefer' }), veh('VEH902', 'available'), veh('VEH903', 'in_workshop'), veh('VEH904', null, { type: 'van' })],
  utilisation: {}, vehicleUtilisation: {}, unassignedOrders: [],
} as unknown as ManualPlanView

function open(onApplyCommand = vi.fn(async () => true), failure: Error | null = null) {
  vi.stubGlobal('fetch', vi.fn(answer))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <PlanningStep3Allocation candidateView={view} activeDepot="Synthetic" failure={failure} onApplyCommand={onApplyCommand}
      onBackToSummary={() => {}} onContinueToExceptions={() => {}} />
  </QueryClientProvider>)
  return onApplyCommand
}

const tripCard = () => screen.getAllByRole('button', { name: 'Change' }).find(button => !(button as HTMLButtonElement).disabled)!

describe('Change Vehicle dialog', () => {
  it('lists the depot fleet with real availability and only lets available vehicles be chosen', async () => {
    open()
    await userEvent.click(tripCard())
    const dialog = screen.getByRole('dialog', { name: 'Change Vehicle for Route' })
    expect(within(dialog).getByText(/Currently assigned:/)).toBeVisible()
    expect(within(dialog).getByRole('radio', { name: /VEH902/ })).toBeEnabled()
    expect(within(dialog).getByRole('radio', { name: /VEH903/ })).toBeDisabled()
    expect(within(dialog).getByText('In workshop')).toBeVisible()
    expect(within(dialog).getByRole('radio', { name: /VEH904/ })).toBeDisabled()
    expect(within(dialog).getByText('Availability not recorded')).toBeVisible()
    expect(within(dialog).queryByRole('radio', { name: /VEH901/ })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('option', { name: 'Trip 1' })).toBeInTheDocument()
    expect(within(dialog).queryByText(/Morning|Afternoon/)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Confirm Vehicle Switch' })).toBeDisabled()
  })

  it('sends the chosen vehicle and slot to the backend with the displayed plan version', async () => {
    const apply = open()
    await userEvent.click(tripCard())
    const dialog = screen.getByRole('dialog', { name: 'Change Vehicle for Route' })
    await userEvent.click(within(dialog).getByRole('radio', { name: /VEH902/ }))
    await userEvent.selectOptions(within(dialog).getByLabelText('Trip slot'), '2')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm Vehicle Switch' }))
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1))
    expect(apply).toHaveBeenCalledWith({
      operation: 'vehicle', tripId: 11,
      body: expect.objectContaining({ expectedVersion: 4, vehicleId: 'VEH902', tripIndex: 2 }),
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the dialog open and shows the backend rule violation inside it when the swap is rejected', async () => {
    const apply = vi.fn(async () => false)
    const failure = new ManualPlanRequestError(new Response(null, { status: 422 }), {
      detail: 'Plan validation failed', code: 'PLAN_INVALID', traceId: 'trace-1',
      violations: [{ ruleCode: 'TEMPERATURE_COMPATIBILITY', severity: 'HARD', message: 'Chilled orders need a reefer', actualValue: 'ambient', allowedValue: 'reefer' }],
    })
    open(apply, failure)
    await userEvent.click(tripCard())
    const dialog = screen.getByRole('dialog', { name: 'Change Vehicle for Route' })
    await userEvent.click(within(dialog).getByRole('radio', { name: /VEH902/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm Vehicle Switch' }))
    await waitFor(() => expect(apply).toHaveBeenCalled())
    expect(screen.getByRole('dialog', { name: 'Change Vehicle for Route' })).toBeVisible()
    expect(within(screen.getByRole('dialog')).getByText(/TEMPERATURE_COMPATIBILITY/)).toBeVisible()
  })

  it('offers Add trip for a standby vehicle and preselects it in the trip dialog', async () => {
    open()
    const standby = screen.getByRole('article', { name: 'Vehicle VEH902' })
    expect(within(standby).queryByRole('button', { name: 'Change' })).not.toBeInTheDocument()
    await userEvent.click(within(standby).getByRole('button', { name: 'Add trip' }))
    const dialog = screen.getByRole('dialog', { name: 'Add Vehicle Trip' })
    expect(within(dialog).getByLabelText('Vehicle')).toHaveValue('VEH902')
    expect(within(dialog).queryByText(/Morning|Afternoon|Perishable|General/)).not.toBeInTheDocument()
  })

  it('folds and unfolds a vehicle card without losing its actions', async () => {
    open()
    const card = screen.getByRole('article', { name: 'Vehicle VEH901' })
    const toggle = within(card).getByRole('button', { name: /Collapse VEH901/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(card).getByText('Volume')).toBeVisible()
    await userEvent.click(toggle)
    expect(within(card).getByRole('button', { name: /Expand VEH901/ })).toHaveAttribute('aria-expanded', 'false')
    expect(within(card).queryByText('Volume')).not.toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Change' })).toBeVisible()
  })

  it('shows the selected trip as a schematic stop sequence, not a map', () => {
    open()
    const panel = screen.getByRole('region', { name: /Route detail for VEH901/ })
    expect(within(panel).getByText(/no map or road route is drawn/)).toBeVisible()
    expect(within(panel).getByText('49 min')).toBeVisible()
  })
})
