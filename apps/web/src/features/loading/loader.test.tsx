import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/auth'
import { LoaderHomePage } from './LoaderHomePage'
import { LoaderTripPage } from './LoaderTripPage'
import { LoaderOrderPage } from './LoaderOrderPage'
import { LoaderShortfallPage } from './LoaderShortfallPage'
import { LoaderIssuesPage } from './LoaderIssuesPage'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const user = { id: 3, username: 'SYN-LDR', displayName: 'Synthetic Loader', role: 'LOADER', outletId: null, depot: 'Synthetic' }

const line = (over: object = {}) => ({ id: 41, orderId: 901, orderRef: 'SYN-901', outletId: 'OUT901', tempRequirement: 'chilled', units: 12,
  weightKg: 240.5, volumeM3: 1.25, stopSeq: 1, loadSeq: 1, status: 'pending', loadedUnits: null, checkedAt: null, carried: false, ...over })
const card = (over: object = {}) => ({ loadTaskId: 7, vehicleId: 'VEH901', tripIndex: 1, brand: 'Fresh', district: 'Alpha', plannedDepart: '03:30:00',
  planVersion: 2, status: 'pending', driverName: 'Synthetic Driver', stops: 1, orders: 1, ordersChecked: 0, stopsLoaded: 0, volumeM3: 1.25,
  volumeCapM3: 25, weightKg: 240.5, weightCapKg: 5000, held: false, awaitingAcknowledgement: false, openIssues: 0, ...over })
const issue = (over: object = {}) => ({ id: 5, loadTaskId: 7, loadLineId: 41, orderId: 901, orderRef: 'SYN-901', outletId: 'OUT901', planDate: '2026-06-26',
  depot: 'Synthetic', vehicleId: 'VEH901', tripIndex: 1, kind: 'MISSING', orderedUnits: 12, shortUnits: 2, note: null, holdsVehicle: true, status: 'OPEN',
  reportedByName: 'Synthetic Loader', reportedAt: '2026-06-25T22:35:00Z', decision: null, decisionNote: null, resolvedByName: null, resolvedAt: null,
  version: 0, ...over })
function detail(over: { task?: object; card?: object; lines?: object[]; issues?: object[]; blockers?: string[]; changes?: object[]; currentTaskId?: number | null } = {}) {
  const lines = (over.lines ?? [line()]) as ReturnType<typeof line>[]
  return {
    task: { id: 7, planId: 3, planVersion: 2, tripId: 9, planDate: '2026-06-26', depot: 'Synthetic', vehicleId: 'VEH901', tripIndex: 1, brand: 'Fresh',
      district: 'Alpha', plannedDepart: '03:30:00', driverUserId: 4, driverName: 'Synthetic Driver', weightCapKg: 5000, volumeCapM3: 25, status: 'pending',
      replacesTaskId: null, acknowledgementRequired: false, acknowledgedAt: null, startedAt: null, loadedAt: null, version: 0,
      createdAt: '2026-06-25T11:00:00Z', updatedAt: '2026-06-25T11:00:00Z', lines, ...over.task },
    card: card(over.card),
    stops: [{ stopNumber: 1, loadPosition: 1, outletId: 'OUT901', district: 'Alpha', lines, volumeM3: 1.25, weightKg: 240.5,
      status: lines.every(l => l.status !== 'pending') ? 'loaded' : 'pending' }],
    replacedPlanVersion: over.changes ? 1 : null, changes: over.changes ?? [], issues: over.issues ?? [], currentTaskId: over.currentTaskId ?? null,
    handoverBlockers: over.blockers ?? [],
  }
}

function serve(routes: Record<string, (request: Request) => unknown>) {
  const fetchSpy = vi.fn(async (request: Request) => {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/auth/me')) return json(user)
    for (const [suffix, handler] of Object.entries(routes)) {
      const [method, path] = suffix.split(' ')
      if (request.method === method && url.pathname.endsWith(path)) {
        const result = handler(request)
        return result instanceof Response ? result : json(result)
      }
    }
    return json({ code: 'NOT_FOUND', detail: 'Resource not found' }, 404)
  })
  vi.stubGlobal('fetch', fetchSpy)
  return fetchSpy
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/loader" element={<LoaderHomePage />} />
            <Route path="/loader/issues" element={<LoaderIssuesPage />} />
            <Route path="/loader/trips/:taskId" element={<LoaderTripPage />} />
            <Route path="/loader/trips/:taskId/orders/:lineId" element={<LoaderOrderPage />} />
            <Route path="/loader/trips/:taskId/orders/:lineId/shortfall" element={<LoaderShortfallPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => { vi.unstubAllGlobals() })

describe('loader screens', () => {
  it('shows assigned trips, server counts, the next departure and open issues on Home', async () => {
    serve({ 'GET /loader/board': () => ({ planDate: '2026-06-26', depot: 'Synthetic', planVersion: 2,
      summary: { tripsAssigned: 2, ordersToLoad: 3, ordersLoaded: 1, openIssues: 1 },
      trips: [card({ status: 'loading', ordersChecked: 1, stopsLoaded: 0, held: true, openIssues: 1 }), card({ loadTaskId: 8, tripIndex: 2, brand: 'Style', status: 'pending' })],
      nextDeparture: card({ status: 'loading', held: true }), openIssues: [issue()] }) })
    renderAt('/loader')
    expect(await screen.findByRole('heading', { name: /Synthetic$/ })).toBeInTheDocument()
    const today = screen.getByLabelText('Today')
    expect(within(today).getByText('Orders to load').querySelector('strong')).toHaveTextContent('3')
    expect(screen.getByRole('heading', { name: 'Trip 1 · VEH901' })).toBeInTheDocument()
    expect(screen.getByText('Vehicle held')).toBeInTheDocument()
    expect(screen.getAllByText('1.3 / 25 m³')[0]).toBeInTheDocument()
    expect(within(screen.getByLabelText('Next departure')).getByText(/03:30 · 1 orders · 1 stops/)).toBeInTheDocument()
    expect(screen.getByText(/SYN-901 · Missing — 2 units short/)).toBeInTheDocument()
    expect(screen.getByText(/10 of 12 units on its receipt/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /View held trip/ })).toHaveAttribute('href', '/loader/trips/7')
    expect(screen.getByRole('link', { name: /View schedule/ })).toHaveAttribute('href', '/loader/trips/8')
  })

  it('tells the loader honestly when nothing is published', async () => {
    serve({ 'GET /loader/board': () => ({ planDate: '2026-06-26', depot: 'Synthetic', planVersion: null,
      summary: { tripsAssigned: 0, ordersToLoad: 0, ordersLoaded: 0, openIssues: 0 }, trips: [], nextDeparture: null, openIssues: [] }) })
    renderAt('/loader')
    expect(await screen.findByText('No trips to load yet')).toBeInTheDocument()
  })

  it('lists stops in loading order and links the next order to count', async () => {
    serve({ 'GET /load-tasks/7': () => detail({ blockers: ['1 order is not counted yet'] }) })
    renderAt('/loader/trips/7')
    expect(await screen.findByRole('heading', { name: 'Trip 1 · VEH901' })).toBeInTheDocument()
    expect(screen.getByText('1st')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Load Stop 1' })).toHaveAttribute('href', '/loader/trips/7/orders/41')
    expect(within(screen.getByLabelText('Trip capacity')).getByText('Manifest v2')).toBeInTheDocument()
  })

  it('requires acknowledging a changed manifest before loading continues', async () => {
    const spy = serve({
      'GET /load-tasks/7': () => detail({ task: { acknowledgementRequired: true, status: 'loading', replacesTaskId: 6 }, card: { awaitingAcknowledgement: true },
        changes: [{ orderRef: 'SYN-902', outletId: 'OUT902', change: 'REMOVED', stopBefore: 2, stopAfter: null, loadedUnits: 8 }] }),
      'POST /load-tasks/7/acknowledge': () => detail({ task: { acknowledgementRequired: true, acknowledgedAt: '2026-06-25T22:40:00Z', version: 1 } }),
    })
    renderAt('/loader/trips/7')
    expect(await screen.findByRole('heading', { name: 'Manifest update · v2' })).toBeInTheDocument()
    expect(screen.getByText(/SYN-902 \(OUT902\) removed from this trip — take its 8 loaded units off the vehicle/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Unload SYN-902')
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge v2' }))
    const post = spy.mock.calls.map(([r]) => r).find(r => r.method === 'POST')!
    expect(await post.json()).toEqual({ expectedVersion: 0 })
    expect(await screen.findByRole('link', { name: 'Load Stop 1' })).toBeInTheDocument()
  })

  it('confirms an order with the displayed manifest version and returns to the trip when all are counted', async () => {
    const spy = serve({
      'GET /load-tasks/7': () => detail(),
      'POST /lines/41/loaded': () => detail({ lines: [line({ status: 'loaded', loadedUnits: 12 })], task: { status: 'loading', version: 1 },
        card: { ordersChecked: 1, stopsLoaded: 1, status: 'loading' } }),
    })
    renderAt('/loader/trips/7/orders/41')
    expect(await screen.findByRole('heading', { name: 'Load order SYN-901' })).toBeInTheDocument()
    expect(screen.getByText('— / 12')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm 12 units loaded' }))
    const post = spy.mock.calls.map(([r]) => r).find(r => r.method === 'POST')!
    expect(new URL(post.url).pathname).toMatch(/\/load-tasks\/7\/lines\/41\/loaded$/)
    expect(await post.json()).toEqual({ expectedVersion: 0 })
    expect(await screen.findByRole('button', { name: 'Mark trip as loaded' })).toBeEnabled()
  })

  it('reports a shortfall with kind, units and hold, and shows the receipt consequence', async () => {
    const spy = serve({
      'GET /load-tasks/7': () => detail(),
      'POST /lines/41/shortfall': () => detail({ lines: [line({ status: 'short', loadedUnits: 9 })], issues: [issue({ shortUnits: 3 })],
        task: { status: 'loading', version: 1 }, card: { held: true, openIssues: 1 } }),
    })
    renderAt('/loader/trips/7/orders/41/shortfall')
    expect(await screen.findByRole('heading', { name: 'Report a shortfall' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Damaged' }))
    await userEvent.click(screen.getByRole('button', { name: '3 units' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes — hold vehicle' }))
    expect(screen.getByText(/OUT901 will see 9 of 12 units on its receipt/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Note for the dispatcher'), 'Crushed crates')
    await userEvent.click(screen.getByRole('button', { name: 'Send to dispatcher' }))
    const post = spy.mock.calls.map(([r]) => r).find(r => r.method === 'POST')!
    expect(await post.json()).toEqual({ kind: 'DAMAGED', shortUnits: 3, holdsVehicle: true, note: 'Crushed crates', expectedVersion: 0 })
    expect(await screen.findByLabelText('Shortfall recorded')).toHaveTextContent('3 of 12 units missing')
  })

  it('keeps the trip from being marked loaded while the server reports blockers', async () => {
    serve({ 'GET /load-tasks/7': () => detail({ lines: [line({ status: 'short', loadedUnits: 10 })], card: { held: true, ordersChecked: 1, stopsLoaded: 1, status: 'loading' },
      task: { status: 'loading' }, blockers: ['The vehicle is held until the dispatcher decides on 1 shortfall'] }) })
    renderAt('/loader/trips/7')
    expect(await screen.findByText('Not ready for handover')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark trip as loaded' })).toBeDisabled()
  })

  it('points a replaced manifest to the current one', async () => {
    serve({ 'GET /load-tasks/6': () => detail({ task: { id: 6, status: 'superseded', planVersion: 1 }, currentTaskId: 7 }) })
    renderAt('/loader/trips/6')
    expect(await screen.findByRole('heading', { name: 'Manifest v1 was replaced' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open current manifest' })).toHaveAttribute('href', '/loader/trips/7')
  })

  it('filters issues and shows the dispatcher decision', async () => {
    serve({ 'GET /loader/issues': () => [issue(), issue({ id: 6, orderRef: 'SYN-902', status: 'RESOLVED', holdsVehicle: false, decision: 'SEND_SHORT',
      decisionNote: 'Send ten', resolvedByName: 'Synthetic Dispatcher', resolvedAt: '2026-06-25T22:50:00Z' })] })
    renderAt('/loader/issues')
    expect(await screen.findByText('VEH901 held · dispatch decision pending')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Open (1)' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Wait for the release instruction')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Resolved (1)' }))
    await waitFor(() => expect(screen.getByText('Decided: Send short')).toBeInTheDocument())
    expect(screen.getByText('Send ten')).toBeInTheDocument()
  })
})
