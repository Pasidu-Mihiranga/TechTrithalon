import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { FleetPage } from './FleetPage'

const overview = { date: '2026-06-26', depot: 'Synthetic', totalVehicles: 2, onRouteVehicles: 1,
  idleVehicles: 0, inWorkshopVehicles: 1, unrecordedVehicles: 0,
  vehicles: [
    { vehicle: { vehicleId: 'SYN-V901', depot: 'Synthetic', type: 'truck', temp: 'ambient',
      volumeCapM3: 20, weightCapKg: 3000, availabilityRecorded: true, availabilityStatus: 'available' },
      state: 'on_route', driverName: 'Synthetic Driver', tripIndex: 1, stopsDone: 2, stops: 4 },
    { vehicle: { vehicleId: 'SYN-V902', depot: 'Synthetic', type: 'van', temp: 'reefer',
      volumeCapM3: 8, weightCapKg: 1000, availabilityRecorded: true, availabilityStatus: 'in_workshop' },
      state: 'in_workshop', driverName: null, tripIndex: null, stopsDone: 0, stops: 0 },
  ] }

describe('fleet overview', () => {
  it('uses server status counts and filters into a vehicle detail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(overview), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })))
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/dispatcher/fleet']}>
        <Routes><Route element={<Outlet context={{ depot: 'Synthetic' }} />}>
          <Route path="/dispatcher/fleet" element={<FleetPage />} />
        </Route></Routes>
      </MemoryRouter>
    </QueryClientProvider>)

    expect(await screen.findByRole('button', { name: 'SYN-V901' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Fleet status' })).getByText('2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Maintenance (1)' }))
    expect(screen.queryByRole('button', { name: 'SYN-V901' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'SYN-V902' }))
    expect(screen.getByRole('link', { name: 'Open vehicle details' })).toHaveAttribute('href', '/dispatcher/fleet/SYN-V902')
    expect(screen.getAllByText('Not assigned').length).toBeGreaterThan(0)
  })
})
