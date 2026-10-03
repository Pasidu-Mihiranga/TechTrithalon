import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/auth'
import { ExceptionsPage } from './ExceptionsPage'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const dispatcher = { id: 1, username: 'SYN-DSP', displayName: 'Synthetic Dispatcher', role: 'DISPATCHER', outletId: null, depot: null }

const item = (over: object = {}) => ({
  id: 'LOADING_ISSUE:7', sourceType: 'LOADING_ISSUE', sourceId: '7', kind: 'LOADING_SHORTFALL', title: 'Loading shortfall: SYN001',
  detail: '2 of 12 units missing · vehicle held', orderRef: 'SYN001', outletId: 'OUT901', vehicleId: 'VEH901', tripIndex: 1, driverName: 'Synthetic Driver',
  planDate: '2026-06-26', reportedByName: 'Synthetic Loader', reportedAt: '2026-06-26T00:00:00Z', status: 'OPEN', ownerName: null, claimedAt: null,
  decisions: ['SEND_SHORT', 'REPLANNED'], decision: null, resolutionNote: null, resolvedByName: null, resolvedAt: null, version: 0, ...over })
const queue = (items: object[]) => {
  const status = (s: string) => items.filter(i => (i as { status: string }).status === s).length
  return { date: '2026-06-26', depot: 'Peliyagoda', asOf: '2026-06-26T00:08:00Z',
    counts: { all: items.length, open: status('OPEN'), inProgress: status('IN_PROGRESS'), resolved: status('RESOLVED') }, items }
}

function serve(routes: Record<string, (request: Request) => unknown>) {
  const spy = vi.fn(async (request: Request) => {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/auth/me')) return json(dispatcher)
    if (url.pathname.endsWith('/reference/summary')) return json({ demoOperatingDate: '2026-06-26' })
    for (const [suffix, handler] of Object.entries(routes)) {
      const [method, path] = suffix.split(' ')
      if (request.method === method && url.pathname.endsWith(path)) { const r = await handler(request); return r instanceof Response ? r : json(r) }
    }
    return json({ code: 'NOT_FOUND', detail: 'Resource not found' }, 404)
  })
  vi.stubGlobal('fetch', spy)
  return spy
}
const bodyOf = async (spy: ReturnType<typeof vi.fn>, suffix: string) =>
  (spy.mock.calls.map(([r]) => r as Request).find(r => r.url.includes(suffix))!).clone().json()

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider><MemoryRouter initialEntries={['/dispatcher/exceptions']}><Routes>
        <Route element={<Outlet context={{ depot: 'Peliyagoda' }} />}><Route path="/dispatcher/exceptions" element={<ExceptionsPage />} /></Route>
      </Routes></MemoryRouter></AuthProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => { vi.unstubAllGlobals() })

describe('dispatcher exceptions queue', () => {
  it('shows the counts on the tabs, filters by status and measures age against the server time', async () => {
    serve({ 'GET /dispatcher/exceptions': () => queue([
      item(), item({ id: 'DELIVERY_PROBLEM:3', sourceType: 'DELIVERY_PROBLEM', sourceId: '3', kind: 'DELIVERY_PARTIAL', title: 'Partial delivery: SYN002', orderRef: 'SYN002', status: 'IN_PROGRESS', ownerName: 'Synthetic Dispatcher', decisions: [] }),
      item({ id: 'SYNC_REVIEW:a', sourceType: 'SYNC_REVIEW', sourceId: 'a', kind: 'SYNC_REJECTED', title: 'Phone action rejected', orderRef: null, status: 'RESOLVED', decisions: [], resolutionNote: 'Stop was not on the route', resolvedByName: 'Synthetic Dispatcher' }),
    ]) })
    renderPage()
    expect(await screen.findByRole('button', { name: 'All (3)' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Open (1)' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'In Progress (1)' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Resolved (1)' })).toBeVisible()
    expect(within(screen.getByRole('list', { name: 'Exceptions' })).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getAllByText(/8 min ago/).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'In Progress (1)' }))
    const rows = within(screen.getByRole('list', { name: 'Exceptions' })).getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Partial delivery: SYN002')
    expect(rows[0]).toHaveTextContent('taken by Synthetic Dispatcher')
  })

  it('takes an item and decides a loading shortfall with the version, decision and note', async () => {
    let open = item()
    const spy = serve({
      'GET /dispatcher/exceptions': () => queue([open]),
      'POST /dispatcher/exceptions/LOADING_ISSUE/7/claim': () => { open = item({ status: 'IN_PROGRESS', ownerName: 'Synthetic Dispatcher' }); return open },
      'POST /dispatcher/exceptions/LOADING_ISSUE/7/resolve': () => { open = item({ status: 'RESOLVED', decision: 'SEND_SHORT' }); return open },
    })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Loading shortfall: SYN001/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Take it' }))
    expect(await screen.findByText('Synthetic Dispatcher', { selector: 'dd' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Take it' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Decide' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a decision.')
    await userEvent.click(screen.getByRole('radio', { name: 'Send short' }))
    await userEvent.click(screen.getByRole('button', { name: 'Decide' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Write what you decided and why.')
    await userEvent.type(screen.getByLabelText('Decision note'), 'Vehicle leaves with 10 units')
    await userEvent.click(screen.getByRole('button', { name: 'Decide' }))
    await waitFor(async () => expect(await bodyOf(spy, '/LOADING_ISSUE/7/resolve')).toEqual({ expectedVersion: 0, decision: 'SEND_SHORT', note: 'Vehicle leaves with 10 units' }))
    expect(await screen.findByLabelText('Resolution')).toHaveTextContent('Send short')
  })

  it('acknowledges a driver problem with a note and no decision', async () => {
    let problem = item({ id: 'DELIVERY_PROBLEM:3', sourceType: 'DELIVERY_PROBLEM', sourceId: '3', kind: 'DELIVERY_PARTIAL', title: 'Partial delivery: SYN002', decisions: [], version: 1, status: 'IN_PROGRESS' })
    const spy = serve({
      'GET /dispatcher/exceptions': () => queue([problem]),
      'POST /dispatcher/exceptions/DELIVERY_PROBLEM/3/resolve': () => { problem = item({ ...problem, status: 'RESOLVED', resolutionNote: 'Called the driver' }); return problem },
    })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Partial delivery: SYN002/ }))
    expect(screen.queryByRole('radio')).toBeNull()
    await userEvent.type(screen.getByLabelText('Note'), 'Called the driver')
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    await waitFor(async () => expect(await bodyOf(spy, '/DELIVERY_PROBLEM/3/resolve')).toEqual({ expectedVersion: 1, note: 'Called the driver' }))
    expect(await screen.findByLabelText('Resolution')).toHaveTextContent('Acknowledged')
  })

  it('shows the server’s message when someone else already closed the item', async () => {
    serve({
      'GET /dispatcher/exceptions': () => queue([item()]),
      'POST /dispatcher/exceptions/LOADING_ISSUE/7/resolve': () => json({ code: 'STALE_ISSUE', detail: 'The issue changed; reload it' }, 409),
    })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Loading shortfall: SYN001/ }))
    await userEvent.click(screen.getByRole('radio', { name: 'Send short' }))
    await userEvent.type(screen.getByLabelText('Decision note'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Decide' }))
    expect(await screen.findByText('The issue changed; reload it')).toBeVisible()
  })

  it('has honest empty and error states', async () => {
    serve({ 'GET /dispatcher/exceptions': () => queue([]) })
    const view = renderPage()
    expect(await screen.findByText('Nothing needs attention')).toBeVisible()
    view.unmount()
    serve({ 'GET /dispatcher/exceptions': () => json({ code: 'FORBIDDEN', detail: 'x' }, 403) })
    renderPage()
    expect(await screen.findByText('Access denied')).toBeVisible()
  })
})
