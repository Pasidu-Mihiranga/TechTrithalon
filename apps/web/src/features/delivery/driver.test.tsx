import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetFieldEngine } from '../../lib/fieldSync'
import { AuthProvider } from '../auth/auth'
import { DriverHomePage } from './DriverHomePage'
import { DriverTripPage } from './DriverTripPage'
import { DriverStopPage } from './DriverStopPage'
import { DriverOrderPage } from './DriverOrderPage'
import { DriverRecordPage } from './DriverRecordPage'
import { DriverDeliveriesPage } from './DriverDeliveriesPage'
import { DriverTripDonePage } from './DriverTripDonePage'
import { SyncStatusPage } from '../offline/SyncStatusPage'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const user = { id: 4, username: 'SYN-DRV', displayName: 'Synthetic Driver', role: 'DRIVER', outletId: null, depot: null }

const card = (over: object = {}) => ({ tripIndex: 1, planDate: '2026-06-26', vehicleId: 'VEH901', brand: 'Fresh', district: 'Alpha', depot: 'Synthetic', planVersion: 2,
  plannedDepart: '03:30:00', stops: 1, orders: 1, units: 12, weightKg: 240.5, volumeM3: 1.25, distanceKm: 20, tripMinutes: 31, chilled: true,
  state: 'READY', loadStatus: 'loaded', stopsDone: 0, ordersDone: 0, issues: 0, startedAt: null, completedAt: null, nextOutletId: 'OUT901',
  nextEta: '03:50:00', ...over })
const order = (over: object = {}) => ({ orderId: 901, orderRef: 'SYN-901', temp: 'chilled', units: 12, loadedUnits: 12, weightKg: 240.5,
  volumeM3: 1.25, outcome: null, ...over })
const stop = (over: object = {}) => ({ seq: 1, outletId: 'OUT901', district: 'Alpha', dockType: 'street', parkingConstraint: 'van_only',
  windowOpen: '05:00:00', windowClose: '07:30:00', plannedArrival: '03:50:00', eta: null, late: false, status: 'PENDING', arrivedAt: null,
  departedAt: null, units: 12, weightKg: 240.5, chilled: true, recorded: 0, orders: [order()], ...over })
const detail = (over: { card?: object; stops?: object[]; version?: number | null; startBlocker?: string | null; currentStopSeq?: number | null; routeChanged?: boolean } = {}) => ({
  card: card(over.card), version: over.version === undefined ? null : over.version, startedPlanVersion: over.version == null ? null : 2,
  routeChanged: over.routeChanged ?? false, startBlocker: over.startBlocker ?? null,
  currentStopSeq: over.currentStopSeq === undefined ? null : over.currentStopSeq, stops: over.stops ?? [stop()],
})
const home = (trips: object[]) => ({ planDate: '2026-06-26', vehicleId: trips.length ? 'VEH901' : null,
  progress: { stops: 2, stopsDone: 0, orders: 2, ordersDone: 0 }, trips, current: trips[0] ?? null })

type SentAction = Record<string, unknown> & { clientActionId: string; actionType: string }
/** Answers the outbox sync: every action applied unless `answer` says otherwise. */
function syncRoute(answer: (action: SentAction) => object = () => ({ result: 'APPLIED' })) {
  return async (request: Request) => {
    const body = await request.clone().json() as { actions: SentAction[] }
    return { results: body.actions.map(a => ({ clientActionId: a.clientActionId, clockSkew: false, ...answer(a) })), syncedAt: '2026-06-25T23:50:00Z' }
  }
}
async function sentActions(fetchSpy: ReturnType<typeof vi.fn>) {
  const requests = fetchSpy.mock.calls.map(([r]) => r as Request).filter(r => r.url.endsWith('/driver/sync'))
  const bodies = await Promise.all(requests.map(r => r.clone().json() as Promise<{ actions: SentAction[] }>))
  return bodies.flatMap(b => b.actions)
}

function serve(routes: Record<string, (request: Request) => unknown>) {
  const fetchSpy = vi.fn(async (request: Request) => {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/auth/me')) return json(user)
    for (const [suffix, handler] of Object.entries(routes)) {
      const [method, path] = suffix.split(' ')
      if (request.method === method && url.pathname.endsWith(path)) {
        const result = await handler(request)
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
            <Route path="/driver" element={<DriverHomePage />} />
            <Route path="/driver/deliveries" element={<DriverDeliveriesPage />} />
            <Route path="/driver/trips/:tripIndex" element={<DriverTripPage />} />
            <Route path="/driver/trips/:tripIndex/complete" element={<DriverTripDonePage />} />
            <Route path="/driver/trips/:tripIndex/stops/:seq" element={<DriverStopPage />} />
            <Route path="/driver/trips/:tripIndex/orders/:orderId" element={<DriverOrderPage />} />
            <Route path="/driver/trips/:tripIndex/orders/:orderId/confirm" element={<DriverRecordPage mode="confirm" />} />
            <Route path="/driver/trips/:tripIndex/orders/:orderId/issue" element={<DriverRecordPage mode="issue" />} />
            <Route path="/driver/sync" element={<SyncStatusPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => { vi.unstubAllGlobals(); resetFieldEngine() })

describe('driver screens', () => {
  it('shows the current trip with its server counts and starts it with the displayed plan version', async () => {
    let started = false
    const fetchSpy = serve({
      'GET /driver/home': () => home([card(), card({ tripIndex: 2, brand: 'Style', chilled: false, state: 'LOADING', loadStatus: 'pending' })]),
      'POST /driver/sync': syncRoute(() => { started = true; return { result: 'APPLIED' } }),
      'GET /driver/trips/1': () => started ? detail({ card: { state: 'IN_PROGRESS' }, version: 0, currentStopSeq: 1 }) : detail(),
      'GET /driver/trips/2': () => detail({ card: { tripIndex: 2, brand: 'Style', state: 'LOADING' } }),
    })
    renderAt('/driver')
    const hero = await screen.findByRole('region', { name: "Today's trip" })
    expect(within(hero).getByText('Ready for Departure')).toBeVisible()
    expect(within(hero).getByText('Synthetic → Alpha')).toBeVisible()
    expect(within(hero).getByText('241 kg')).toBeVisible()
    expect(screen.getByText('0 / 2 stops')).toBeVisible()
    expect(within(screen.getByRole('region', { name: 'Trip summary' })).getByText('20 km · 31m')).toBeVisible()
    expect(within(screen.getByRole('region', { name: 'Other trips' })).getByText('Not started')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Start Trip' }))
    await waitFor(async () => expect(await sentActions(fetchSpy)).toHaveLength(1))
    const [start] = await sentActions(fetchSpy)
    expect(start).toMatchObject({ actionType: 'TRIP_START', planDate: '2026-06-26', tripIndex: 1, planVersion: 2 })
    expect(start.clientActionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(typeof start.occurredAt).toBe('string')
  })

  it('shows an honest empty state when no trip is published to the driver', async () => {
    serve({ 'GET /driver/home': () => home([]) })
    renderAt('/driver')
    expect(await screen.findByText('No trips assigned yet')).toBeVisible()
  })

  it('blocks the start until the loader hands the trip over, with the server reason', async () => {
    serve({ 'GET /driver/trips/1': () => detail({ card: { state: 'LOADING', loadStatus: 'loading' }, startBlocker: 'The loader has not handed this trip over yet' }),
      'GET /driver/home': () => home([card({ state: 'LOADING' })]) })
    renderAt('/driver/trips/1')
    expect(await screen.findByText('The loader has not handed this trip over yet.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Start Trip' })).toBeDisabled()
  })

  it('lists stops with the projected arrival and marks the current stop', async () => {
    serve({ 'GET /driver/trips/1': () => detail({ card: { state: 'IN_PROGRESS' }, version: 1, currentStopSeq: 1, routeChanged: true,
      stops: [stop({ eta: '05:10:00' }), stop({ seq: 2, outletId: 'OUT902', eta: '05:40:00', late: true })] }),
      'GET /driver/home': () => home([card({ state: 'IN_PROGRESS' })]) })
    renderAt('/driver/trips/1')
    const sequence = await screen.findByRole('region', { name: 'Stop sequence' })
    const items = within(sequence).getAllByRole('link')
    expect(within(items[0]).getByText('Current')).toBeVisible()
    expect(items[0]).toHaveTextContent('ETA 05:10')
    expect(items[1]).toHaveTextContent('ETA 05:40 · after window')
    expect(screen.getByRole('region', { name: 'Next stop' })).toHaveTextContent('OUT901')
    expect(screen.getByText(/updated this trip to plan v2/)).toBeVisible()
  })

  it('records arrival through the outbox, then opens the first order', async () => {
    let arrived = false
    const fetchSpy = serve({
      'GET /driver/trips/1': () => arrived
        ? detail({ card: { state: 'IN_PROGRESS' }, version: 4, currentStopSeq: 1, stops: [stop({ status: 'ARRIVED', arrivedAt: '2026-06-25T23:48:00Z' })] })
        : detail({ card: { state: 'IN_PROGRESS' }, version: 3, currentStopSeq: 1 }),
      'POST /driver/sync': syncRoute(() => { arrived = true; return { result: 'APPLIED' } }),
    })
    renderAt('/driver/trips/1/stops/1')
    expect(await screen.findByText(/Delivery window: 05:00 – 07:30/)).toBeVisible()
    expect(screen.getByText(/parking: van only/)).toBeVisible()
    expect(screen.getByText(/SYN-901 is chilled/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: "I've Arrived" }))
    expect(await screen.findByRole('button', { name: 'Start Delivery' }, { timeout: 4000 })).toBeVisible()
    expect((await sentActions(fetchSpy))[0]).toMatchObject({ actionType: 'STOP_ARRIVE', outletId: 'OUT901', tripIndex: 1 })
    expect(screen.getByText('Arrived · 05:18')).toBeVisible()
  })

  it('shows a sent-short order honestly before delivery', async () => {
    serve({ 'GET /driver/trips/1': () => detail({ card: { state: 'IN_PROGRESS' }, version: 1, currentStopSeq: 1,
      stops: [stop({ status: 'ARRIVED', orders: [order({ loadedUnits: 10 })] })] }) })
    renderAt('/driver/trips/1/orders/901')
    expect(await screen.findByText(/Sent short: 10 of 12 units left the depot/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Report Issue' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Delivered' })).toBeVisible()
  })

  it('requires the recipient (and proof when storage is configured) before confirming a delivery', async () => {
    const fetchSpy = serve({
      'GET /driver/trips/1': () => detail({ card: { state: 'IN_PROGRESS' }, version: 2, currentStopSeq: 1, stops: [stop({ status: 'ARRIVED' })] }),
      'GET /driver/capabilities': () => ({ proofUploads: false, maxUploadBytes: 5242880 }),
      'POST /driver/sync': syncRoute(),
    })
    renderAt('/driver/trips/1/orders/901/confirm')
    expect(await screen.findByText(/Proof photos are not set up on this server/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Delivery' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter who received the order.')
    await userEvent.type(screen.getByLabelText('Recipient name'), 'S. Perera')
    expect(screen.queryByRole('alert')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Delivery' }))
    await waitFor(async () => expect(await sentActions(fetchSpy)).toHaveLength(1))
    expect((await sentActions(fetchSpy))[0]).toMatchObject({ actionType: 'ORDER_OUTCOME', orderId: 901, outcome: 'DELIVERED',
      recipientName: 'S. Perera', proofUploadIds: [] })
  })

  it('asks for a photo or signature when proof storage is available', async () => {
    serve({ 'GET /driver/trips/1': () => detail({ card: { state: 'IN_PROGRESS' }, version: 2, currentStopSeq: 1, stops: [stop({ status: 'ARRIVED' })] }),
      'GET /driver/capabilities': () => ({ proofUploads: true, maxUploadBytes: 5242880 }) })
    renderAt('/driver/trips/1/orders/901/confirm')
    expect(await screen.findByLabelText('Take proof photo')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Recipient name'), 'S. Perera')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Delivery' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Add a photo or the recipient’s signature.')
  })

  it('turns a reported issue into a partial delivery with the units handed over, then shows it recorded', async () => {
    const fetchSpy = serve({
      'GET /driver/trips/1': () => detail({ card: { state: 'IN_PROGRESS' }, version: 2, currentStopSeq: 1, stops: [stop({ status: 'ARRIVED' })] }),
      'GET /driver/capabilities': () => ({ proofUploads: false, maxUploadBytes: 5242880 }),
      'POST /driver/sync': syncRoute(),
    })
    renderAt('/driver/trips/1/orders/901/issue')
    await userEvent.click(await screen.findByRole('radio', { name: 'Damaged item' }))
    await userEvent.click(screen.getByRole('button', { name: 'More units' }))
    expect(screen.getByText('10 units are handed over.')).toBeVisible()
    await userEvent.type(screen.getByLabelText('Recipient name'), 'S. Perera')
    await userEvent.click(screen.getByRole('button', { name: 'Submit Issue' }))
    expect(await screen.findByRole('heading', { name: 'Issue recorded' })).toBeVisible()
    expect(screen.getByText('10 of 12 units')).toBeVisible()
    expect((await sentActions(fetchSpy))[0]).toMatchObject({ actionType: 'ORDER_OUTCOME', outcome: 'PARTIAL', deliveredUnits: 10,
      issueKind: 'DAMAGED', recipientName: 'S. Perera' })
  })

  it('records a customer who is not there as a failed delivery without a recipient', async () => {
    const fetchSpy = serve({
      'GET /driver/trips/1': () => detail({ card: { state: 'IN_PROGRESS' }, version: 2, currentStopSeq: 1, stops: [stop({ status: 'ARRIVED' })] }),
      'GET /driver/capabilities': () => ({ proofUploads: true, maxUploadBytes: 5242880 }),
      'POST /driver/sync': syncRoute(),
    })
    renderAt('/driver/trips/1/orders/901/issue')
    await userEvent.click(await screen.findByRole('radio', { name: 'Customer unavailable' }))
    expect(screen.queryByLabelText('Recipient name')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Submit Issue' }))
    await waitFor(async () => expect(await sentActions(fetchSpy)).toHaveLength(1))
    const sent = (await sentActions(fetchSpy))[0]
    expect(sent).toMatchObject({ actionType: 'ORDER_OUTCOME', outcome: 'FAILED', issueKind: 'CUSTOMER_UNAVAILABLE' })
    expect(sent.recipientName).toBeUndefined()
  })

  it('shows the server answer when a synced action is refused, and undoes it on screen', async () => {
    serve({ 'GET /driver/trips/1': () => detail({ card: { state: 'IN_PROGRESS' }, version: 3, currentStopSeq: 1 }),
      'POST /driver/sync': syncRoute(() => ({ result: 'CONFLICT', code: 'STOP_IN_PROGRESS', message: 'Finish the stop at OUT902 first' })) })
    renderAt('/driver/trips/1/stops/1')
    await userEvent.click(await screen.findByRole('button', { name: "I've Arrived" }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Finish the stop at OUT902 first')
    expect(screen.getByRole('button', { name: "I've Arrived" })).toBeVisible()
  })

  it('shows the trip summary from server counts and finishes the trip', async () => {
    const fetchSpy = serve({
      'GET /driver/trips/1': () => detail({ card: { state: 'IN_PROGRESS', stopsDone: 1, ordersDone: 1, issues: 1 }, version: 4,
        stops: [stop({ status: 'COMPLETED', recorded: 1 })] }),
      'POST /driver/sync': syncRoute(),
    })
    renderAt('/driver/trips/1/complete')
    expect(await screen.findByRole('heading', { name: 'Trip completed' })).toBeVisible()
    expect(screen.getByText('1 issue reported')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Finish Trip' }))
    expect(await screen.findByRole('heading', { name: 'Trip submitted' })).toBeVisible()
    expect((await sentActions(fetchSpy))[0]).toMatchObject({ actionType: 'TRIP_COMPLETE', tripIndex: 1 })
  })

  it('filters and searches today’s deliveries', async () => {
    serve({ 'GET /driver/deliveries': () => ({ planDate: '2026-06-26', rows: [
      { tripIndex: 1, seq: 1, outletId: 'OUT901', district: 'Alpha', orders: 1, units: 12, weightKg: 240.5, status: 'DELIVERED',
        completedAt: '2026-06-25T23:52:00Z', eta: null, orderRefs: ['SYN-901'] },
      { tripIndex: 2, seq: 1, outletId: 'OUT902', district: 'Alpha', orders: 1, units: 8, weightKg: 96, status: 'PENDING',
        completedAt: null, eta: '08:20:00', orderRefs: ['SYN-902'] }] }) })
    renderAt('/driver/deliveries')
    expect(await screen.findByText("Today's deliveries · 2 stops")).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Pending' }))
    expect(screen.queryByText('OUT901')).toBeNull()
    expect(screen.getByText('ETA 08:20')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    await userEvent.type(screen.getByLabelText('Search order or outlet'), 'syn-901')
    expect(screen.getByText('OUT901')).toBeVisible()
    expect(screen.queryByText('OUT902')).toBeNull()
  })

  it('saves an arrival on the phone without a connection, shows it at once and counts it as waiting', async () => {
    serve({ 'GET /driver/trips/1': () => detail({ card: { state: 'IN_PROGRESS' }, version: 3, currentStopSeq: 1 }),
      'POST /driver/sync': () => { throw new TypeError('Failed to fetch') } })
    renderAt('/driver/trips/1/stops/1')
    await userEvent.click(await screen.findByRole('button', { name: "I've Arrived" }))
    expect(await screen.findByRole('button', { name: 'Start Delivery' })).toBeVisible()
    expect(screen.getByRole('link', { name: /Sync status: (Offline|Saved) · 1/ })).toBeVisible()
    expect(screen.getByText('Offline — saved on this phone, will sync automatically')).toBeVisible()
  })

  it('lists records the dispatcher reviews after a sync', async () => {
    serve({ 'GET /driver/trips/1': () => detail({ card: { state: 'IN_PROGRESS' }, version: 3, currentStopSeq: 1, stops: [stop({ status: 'ARRIVED' })] }),
      'GET /driver/capabilities': () => ({ proofUploads: false, maxUploadBytes: 5242880 }),
      'POST /driver/sync': syncRoute(() => ({ result: 'APPLIED', review: 'ORDER_NOT_ON_TRIP' })) })
    renderAt('/driver/trips/1/orders/901/confirm')
    await userEvent.type(await screen.findByLabelText('Recipient name'), 'S. Perera')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Delivery' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirm Delivery' })).toBeNull())
  })
})
