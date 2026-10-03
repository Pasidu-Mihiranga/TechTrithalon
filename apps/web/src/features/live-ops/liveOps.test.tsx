import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/auth'
import { LiveOperationsPage } from './LiveOperationsPage'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const dispatcher = { id: 1, username: 'SYN-DSP', displayName: 'Synthetic Dispatcher', role: 'DISPATCHER', outletId: null, depot: null }

const vehicle = (over: object = {}) => ({
  vehicleId: 'VEH901', tripIndex: 1, brand: 'Fresh', district: 'Alpha', driverName: 'Synthetic Driver', state: 'IN_TRANSIT', planVersion: 1, plannedDepart: '03:00:00',
  startedAt: '2026-06-26T00:00:00Z', completedAt: null, stops: 3, stopsDone: 1, currentStopSeq: 2, currentOutletId: 'OUT902', currentStopState: 'EN_ROUTE',
  currentEta: '06:10:00', orders: 3, ordersDone: 1, issues: 0, lastUpdateAt: '2026-06-26T00:10:00Z', minutesAgo: 2,
  stopMarks: [{ seq: 1, outletId: 'OUT901', status: 'COMPLETED', late: false }, { seq: 2, outletId: 'OUT902', status: 'PENDING', late: false }, { seq: 3, outletId: 'OUT903', status: 'PENDING', late: false }], ...over })
const board = (vehicles: object[]) => {
  const n = (s: string) => vehicles.filter(v => (v as { state: string }).state === s).length
  return { date: '2026-06-26', depot: 'Peliyagoda', asOf: '2026-06-26T00:12:00Z',
    counts: { total: vehicles.length, loading: n('LOADING'), ready: n('READY'), inTransit: n('IN_TRANSIT'), delayed: n('DELAYED'), completed: n('COMPLETED') }, vehicles }
}

function serve(handler: () => unknown) {
  const spy = vi.fn(async (request: Request) => {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/auth/me')) return json(dispatcher)
    if (url.pathname.endsWith('/reference/summary')) return json({ demoOperatingDate: '2026-06-26' })
    if (url.pathname.endsWith('/dispatcher/live-operations')) { const r = await handler(); return r instanceof Response ? r : json(r) }
    return json({ code: 'NOT_FOUND', detail: 'Resource not found' }, 404)
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider><MemoryRouter initialEntries={['/dispatcher/live-operations']}><Routes>
        <Route element={<Outlet context={{ depot: 'Peliyagoda' }} />}><Route path="/dispatcher/live-operations" element={<LiveOperationsPage />} /></Route>
      </Routes></MemoryRouter></AuthProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => { vi.unstubAllGlobals() })

describe('Live Operations', () => {
  it('lists vehicles with the delayed one first and shows the server’s progress, stop and last update', async () => {
    const spy = serve(() => board([
      vehicle(), vehicle({ vehicleId: 'VEH902', tripIndex: 2, state: 'DELAYED', currentStopSeq: 1, minutesAgo: 14 }),
      vehicle({ vehicleId: 'VEH903', state: 'LOADING', currentStopSeq: null, currentOutletId: null, currentStopState: null, startedAt: null, stopsDone: 0, ordersDone: 0 }),
    ]))
    renderPage()
    const card = await screen.findByRole('article', { name: 'VEH902 trip 2' })       // delayed sorts first and is opened
    expect(within(card).getByText('Delayed')).toBeVisible()
    expect(within(card).getByText('1 / 3 orders')).toBeVisible()
    expect(within(card).getByText('OUT902 (1 of 3)')).toBeVisible()
    expect(within(card).getByText('14 min ago')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Show VEH901 trip 1' })).toHaveTextContent('In Transit')
    expect(screen.getByRole('button', { name: 'Show VEH903 trip 1' })).toHaveTextContent('Loading')
    expect(spy.mock.calls.some(([r]) => (r as Request).url.includes('date=2026-06-26') && (r as Request).url.includes('depot=Peliyagoda'))).toBe(true)
  })

  it('selects another vehicle, shows its stops and filters by where the trip is', async () => {
    serve(() => board([vehicle(), vehicle({ vehicleId: 'VEH902', state: 'COMPLETED', currentStopSeq: null, currentStopState: null, stopsDone: 3, ordersDone: 3 })]))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Show VEH902 trip 1' }))
    const card = await screen.findByRole('article', { name: 'VEH902 trip 1' })
    expect(within(card).getByText('All stops served')).toBeVisible()
    await userEvent.click(within(card).getByRole('button', { name: /View Trip Details/ }))
    expect(within(screen.getByRole('list', { name: 'Trip stops' })).getAllByRole('listitem').length).toBeGreaterThanOrEqual(3)
    await userEvent.click(screen.getByRole('button', { name: 'On the road (1)' }))
    expect(screen.queryByRole('article', { name: 'VEH902 trip 1' })).toBeNull()
    expect(screen.getByRole('article', { name: 'VEH901 trip 1' })).toBeVisible()
  })

  it('draws a spoke per trip and says it is a schematic', async () => {
    serve(() => board([vehicle(), vehicle({ vehicleId: 'VEH902' })]))
    renderPage()
    const map = await screen.findByRole('region', { name: 'Route progress' })
    expect(within(map).getByRole('img', { name: /Trips from the depot/ })).toBeVisible()
    expect(within(map).getAllByText('Alpha')).toHaveLength(2)
    expect(map).toHaveTextContent('Schematic only')
  })

  it('has honest empty, error and forbidden states', async () => {
    serve(() => board([]))
    const view = renderPage()
    expect(await screen.findByText('No published trips for this run')).toBeVisible()
    view.unmount()
    serve(() => json({ code: 'INTERNAL_ERROR', detail: 'boom', traceId: 't-1' }, 500))
    const failed = renderPage()
    expect(await screen.findByText('Something went wrong')).toBeVisible()
    failed.unmount()
    serve(() => json({ code: 'FORBIDDEN', detail: 'x' }, 403))
    renderPage()
    expect(await screen.findByText('Access denied')).toBeVisible()
  })
})
