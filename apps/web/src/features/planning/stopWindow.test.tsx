import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { PlanningStep3Allocation, formatDeliveryWindow } from './PlanningStep3Allocation'
import type { ManualPlanView } from './manualPlanQueries'

const geography = { attribution: 'Synthetic test boundaries', depots: [{ name: 'Synthetic', lat: 7, lng: 80, basis: 'Synthetic point' }],
  districts: [{ district: 'Alpha', served: true, depot: 'Synthetic', labelPoint: [80.1, 7.1], geometry: { type: 'Polygon', coordinates: [[[80, 7], [80.3, 7], [80.3, 7.3], [80, 7.3], [80, 7]]] } }],
  links: [{ district: 'Alpha', depot: 'Synthetic', depotToDistrictKm: 10, depotToDistrictMinutes: 20, interStopKm: 3, interStopMinutes: 7, roadClass: 'urban' }] }
const answer = async (request: Request) => new Response(request.url.includes('/reference/geography') ? JSON.stringify(geography) : '[]', { status: 200, headers: { 'Content-Type': 'application/json' } })

const sources = import.meta.glob('./*.tsx', { query: '?raw', import: 'default', eager: true })
const navSources = import.meta.glob('../../app/roles.ts', { query: '?raw', import: 'default', eager: true })

const order = (id: number, open?: string, close?: string) => ({
  id, orderRef: `SYN-${id}`, outletId: `OUT${id}`, brand: 'Fresh', temp: 'ambient', volumeM3: 1, weightKg: 10,
  district: 'Alpha', depot: 'Synthetic', dockType: 'street', parkingConstraint: 'normal',
  effectiveWindowOpen: open, effectiveWindowClose: close,
})

const view = {
  plan: { id: 801, lockVersion: 1, status: 'candidate' },
  trips: [{
    id: 11, vehicleId: 'VEH901', tripIndex: 1, brand: 'Fresh', district: 'Alpha', tripMinutes: 49, distanceKm: 23, fuelLitres: 4.6,
    stops: [
      { orderId: 1, stopIndex: 1, plannedArrival: '03:50:00', serviceStart: '05:00:00', order: order(1, '05:00:00', '05:20:00') },
      { orderId: 2, stopIndex: 2, plannedArrival: '05:18:00', serviceStart: '05:18:00', order: order(2) },
    ],
  }],
  fleet: [], utilisation: {}, unassignedOrders: [],
} as unknown as ManualPlanView

describe('Step 3 stop windows', () => {
  it('formats only backend windows and never substitutes one', () => {
    expect(formatDeliveryWindow('05:00:00', '07:30:00')).toBe('05:00–07:30')
    expect(formatDeliveryWindow(undefined, '07:30:00')).toBe('unavailable')
    expect(formatDeliveryWindow(null, null)).toBe('unavailable')
  })

  it('shows the effective window and the planned arrival as separate facts', async () => {
    vi.stubGlobal('fetch', vi.fn(answer))
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PlanningStep3Allocation candidateView={view} activeDepot="Synthetic" onBackToSummary={() => {}} onContinueToExceptions={() => {}} />
    </QueryClientProvider>)
    await userEvent.click(screen.getAllByRole('button', { name: /review/i })[0])
    expect(screen.getByText('🕒 Window 05:00–05:20')).toBeInTheDocument()
    expect(screen.getAllByText('Arrives 03:50').length).toBeGreaterThan(0)
    expect(screen.getByText('🕒 Window unavailable')).toBeInTheDocument()
    expect(screen.queryByText(/06:00–08:00/)).not.toBeInTheDocument()
  })

  it('does not invent capacities, time budgets, fuel quotas, outlet names or nav badges', () => {
    const step3 = String(sources['./PlanningStep3Allocation.tsx'])
    expect(step3.match(/\?\? (20|3000|300)\b|total: (540|360)\b|Waypoint \$\{/g) ?? []).toEqual([])
    const roles = String(navSources['../../app/roles.ts'])
    expect(roles.match(/badge:\s*\d/g) ?? []).toEqual([])
  })

  it('keeps invented delivery windows out of the planning screens', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith('.test.tsx'))
      .filter(([, source]) => String(source).includes("'06:00–08:00'"))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})
