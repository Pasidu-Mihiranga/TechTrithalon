import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { FleetDetailPage } from './FleetDetailPage'

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

describe('fleet availability', () => {
  it('requires a note and sends the server version when changing a vehicle', async () => {
    let saved: unknown
    let current = { vehicleId: 'SYN-V901', date: '2026-06-26', depot: 'Synthetic', type: 'truck', temp: 'ambient',
      volumeCapM3: 20, weightCapKg: 3000, availabilityRecorded: true, availabilityStatus: 'available', availabilityVersion: 4 }
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      if (request.method === 'PATCH') {
        saved = await request.clone().json()
        current = { ...current, availabilityStatus: 'in_workshop', availabilityVersion: 5 }
      }
      return json(current)
    }))
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/dispatcher/fleet/SYN-V901']}>
        <Routes><Route path="/dispatcher/fleet/:vehicleId" element={<FleetDetailPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>)

    await screen.findByText('SYN-V901')
    expect(screen.getByRole('button', { name: 'Save availability' })).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'in_workshop')
    await userEvent.type(screen.getByLabelText('Reason for change'), 'Workshop inspection')
    await userEvent.click(screen.getByRole('button', { name: 'Save availability' }))
    await waitFor(() => expect(saved).toEqual({ date: '2026-06-26', status: 'in_workshop',
      note: 'Workshop inspection', expectedVersion: 4 }))
    expect(await screen.findByText('Availability saved.')).toBeInTheDocument()
  })
})
