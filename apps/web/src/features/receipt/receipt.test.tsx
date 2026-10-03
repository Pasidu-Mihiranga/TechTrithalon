import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/auth'
import { StoreDeliveriesPage } from './StoreDeliveriesPage'
import { ConfirmReceiptPage } from './ConfirmReceiptPage'
import { ReportIssuePage } from './ReportIssuePage'
import { StoreIssuesPage } from './StoreIssuesPage'
import { ReceiptDiscrepanciesPanel } from './ReceiptDiscrepanciesPanel'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const store = { id: 5, username: 'SYN-STM', displayName: 'Synthetic Store', role: 'STORE_MANAGER', outletId: 'OUT901', depot: null }
const dispatcher = { id: 1, username: 'SYN-DSP', displayName: 'Synthetic Dispatcher', role: 'DISPATCHER', outletId: null, depot: null }

const row = (over: object = {}) => ({ orderId: 901, orderRef: 'SYN-901', planDate: '2026-06-26', phase: 'DELIVERED', receipt: 'NONE', tempRequirement: 'chilled',
  units: 12, windowOpen: '05:00:00', windowClose: '07:30:00', driverName: 'Synthetic Driver', vehicleId: 'VEH901', tripIndex: 1, plannedArrival: null,
  outcome: 'DELIVERED', deliveredUnits: 12, deliveredAt: '2026-06-26T00:22:00Z', ...over })
const detail = (over: { row?: object; canConfirm?: boolean; blocker?: string | null; receiptRecord?: object | null; discrepancy?: object | null; timeline?: object[] } = {}) => ({
  row: row(over.row), outletId: 'OUT901', district: 'Alpha', brand: 'Fresh', dockType: 'street', parkingConstraint: 'normal', status: 'delivered', loadedUnits: 12,
  issueKind: null, recipientName: 'S. Perera', photos: 1, signatures: 1, receiptRecord: over.receiptRecord ?? null, discrepancy: over.discrepancy ?? null,
  canConfirm: over.canConfirm ?? true, blocker: over.blocker ?? null,
  timeline: over.timeline ?? [{ label: 'Order placed', at: '2026-06-25T09:00:00Z' }, { label: 'Delivered', at: '2026-06-26T00:22:00Z' }] })
const issue = (over: object = {}) => ({ id: 7, receiptId: 3, orderId: 901, orderRef: 'SYN-901', outletId: 'OUT901', depot: 'Synthetic', deliveredUnits: 12, kind: 'SHORT',
  affectedUnits: 2, note: 'Two crates missing', vehicleId: 'VEH901', driverName: 'Synthetic Driver', deliveredAt: '2026-06-26T00:22:00Z', reportedByName: 'Synthetic Store',
  reportedAt: '2026-06-26T00:40:00Z', status: 'OPEN', decision: null, decisionNote: null, resolvedByName: null, resolvedAt: null, version: 0, ...over })

function serve(me: object, routes: Record<string, (request: Request) => unknown>) {
  const spy = vi.fn(async (request: Request) => {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/auth/me')) return json(me)
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
  (spy.mock.calls.map(([r]) => r as Request).find(r => r.url.endsWith(suffix))!).clone().json()

function renderAt(path: string, element?: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider><MemoryRouter initialEntries={[path]}><Routes>
        <Route path="/store/deliveries" element={<StoreDeliveriesPage />} />
        <Route path="/store/deliveries/:orderId" element={<ConfirmReceiptPage />} />
        <Route path="/store/deliveries/:orderId/issue" element={<ReportIssuePage />} />
        <Route path="/store/issues" element={<StoreIssuesPage />} />
        <Route path="/dispatcher/exceptions" element={element ?? <ReceiptDiscrepanciesPanel />} />
      </Routes></MemoryRouter></AuthProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => { vi.unstubAllGlobals() })

describe('store deliveries and receipt', () => {
  it('lists the outlet’s deliveries with the server status and filters by phase', async () => {
    serve(store, { 'GET /store/deliveries': () => ({ outletId: 'OUT901', rows: [
      row(), row({ orderId: 902, orderRef: 'SYN-902', phase: 'PENDING', outcome: null, deliveredUnits: null, deliveredAt: null, plannedArrival: '05:40:00' }),
      row({ orderId: 903, orderRef: 'SYN-903', receipt: 'DISPUTED' }), row({ orderId: 904, orderRef: 'SYN-904', outcome: 'FAILED', deliveredUnits: 0 })] }) })
    renderAt('/store/deliveries')
    expect(await screen.findByRole('article', { name: 'SYN-901' })).toHaveTextContent('Confirm receipt →')
    expect(within(screen.getByRole('article', { name: 'SYN-902' })).getByText('Pending')).toBeVisible()
    expect(screen.getByRole('article', { name: 'SYN-902' })).toHaveTextContent('planned 05:40')
    expect(within(screen.getByRole('article', { name: 'SYN-903' })).getByText('Issue open')).toBeVisible()
    expect(within(screen.getByRole('article', { name: 'SYN-904' })).getByText('Not delivered')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Pending' }))
    expect(screen.queryByRole('article', { name: 'SYN-901' })).toBeNull()
    expect(screen.getByRole('article', { name: 'SYN-902' })).toBeVisible()
  })

  it('shows the driver’s proof and confirms receipt once', async () => {
    let confirmed = false
    const spy = serve(store, {
      'GET /store/deliveries/901': () => confirmed ? detail({ row: { receipt: 'CONFIRMED' }, canConfirm: false,
        receiptRecord: { outcome: 'CONFIRMED' }, timeline: [{ label: 'Receipt confirmed', at: '2026-06-26T01:00:00Z' }] }) : detail(),
      'POST /store/deliveries/901/receipt': () => { confirmed = true; return detail({ row: { receipt: 'CONFIRMED' }, canConfirm: false, receiptRecord: { outcome: 'CONFIRMED' } }) },
    })
    renderAt('/store/deliveries/901')
    expect(await screen.findByRole('heading', { name: 'Confirm receipt' })).toBeVisible()
    expect(screen.getByText('S. Perera')).toBeVisible()
    expect(screen.getByText('Photo captured')).toBeVisible()
    expect(screen.getByText('Signature captured')).toBeVisible()
    expect(within(screen.getByRole('table', { name: 'Order lines' })).getByText('Matches')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm receipt' }))
    expect(await screen.findByText(/Receipt confirmed\. Thank you/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Confirm receipt' })).toBeNull()
    expect(spy.mock.calls.filter(([r]) => (r as Request).url.endsWith('/receipt') && (r as Request).method === 'POST')).toHaveLength(1)
  })

  it('offers nothing to confirm before delivery or after a failed delivery, with the reason', async () => {
    serve(store, { 'GET /store/deliveries/901': () => detail({ row: { phase: 'IN_DELIVERY', outcome: null, deliveredUnits: null, deliveredAt: null, plannedArrival: '05:40:00' },
      canConfirm: false, blocker: 'The driver has not delivered this order yet.' }) })
    renderAt('/store/deliveries/901')
    expect(await screen.findByText(/Your order is out for delivery\. Planned arrival 05:40/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Confirm receipt' })).toBeNull()
  })

  it('validates the issue form and sends the kind, units and details', async () => {
    const spy = serve(store, {
      'GET /store/deliveries/901': () => detail(),
      'POST /store/deliveries/901/issue': () => detail({ row: { receipt: 'DISPUTED' }, canConfirm: false }),
      'GET /store/issues': () => [issue()],
    })
    renderAt('/store/deliveries/901/issue')
    await userEvent.click(await screen.findByRole('button', { name: 'Submit issue' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose what is wrong.')
    await userEvent.click(screen.getByRole('radio', { name: 'Other' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit issue' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Describe what is wrong.')
    await userEvent.click(screen.getByRole('radio', { name: 'Short' }))
    await userEvent.clear(screen.getByLabelText(/Units affected/)); await userEvent.type(screen.getByLabelText(/Units affected/), '2')
    await userEvent.type(screen.getByLabelText(/Details/), 'Two crates missing')
    await userEvent.click(screen.getByRole('button', { name: 'Submit issue' }))
    await waitFor(async () => expect(await bodyOf(spy, '/issue')).toEqual({ kind: 'SHORT', affectedUnits: 2, note: 'Two crates missing' }))
    expect(await screen.findByRole('heading', { name: 'Issues' })).toBeVisible()
  })

  it('shows reported issues with their status and what happens next', async () => {
    serve(store, { 'GET /store/issues': () => [issue(), issue({ id: 8, orderRef: 'SYN-902', orderId: 902, status: 'RESOLVED', decision: 'CREDIT',
      decisionNote: 'Credit 2 units', resolvedByName: 'Synthetic Dispatcher', resolvedAt: '2026-06-26T02:00:00Z', kind: 'DAMAGED' })] })
    renderAt('/store/issues')
    expect(await screen.findByRole('tab', { name: 'Open (1)' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Resolved (1)' })).toBeVisible()
    expect(within(screen.getByRole('complementary', { name: 'Issue detail' })).getByText('Short: 2 of 12 units')).toBeVisible()
    expect(screen.getByText(/Your dispatcher has been notified/)).toBeVisible()
    await userEvent.click(screen.getByRole('tab', { name: 'Resolved (1)' }))
    expect(within(screen.getByRole('complementary', { name: 'Issue detail' })).getByText(/Credit 2 units/)).toBeVisible()
  })
})

describe('dispatcher receipt discrepancies', () => {
  it('lists open disputes and resolves one with a decision and a note', async () => {
    const spy = serve(dispatcher, {
      'GET /dispatcher/receipt-discrepancies': () => [issue()],
      'POST /dispatcher/receipt-discrepancies/7/resolve': () => issue({ status: 'RESOLVED', version: 1 }),
    })
    renderAt('/dispatcher/exceptions')
    const card = await screen.findByRole('article', { name: 'Receipt discrepancy SYN-901' })
    expect(card).toHaveTextContent('Short: 2 of 12 units')
    expect(card).toHaveTextContent('VEH901')
    await userEvent.click(within(card).getByRole('button', { name: 'Resolve' }))
    expect(within(card).getByRole('alert')).toHaveTextContent('Choose a decision.')
    await userEvent.click(within(card).getByRole('radio', { name: 'Credit the store' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Resolve' }))
    expect(within(card).getByRole('alert')).toHaveTextContent('Write what you decided and why.')
    await userEvent.type(within(card).getByLabelText('Decision note for SYN-901'), 'Credit 2 units')
    await userEvent.click(within(card).getByRole('button', { name: 'Resolve' }))
    await waitFor(async () => expect(await bodyOf(spy, '/7/resolve')).toEqual({ expectedVersion: 0, decision: 'CREDIT', note: 'Credit 2 units' }))
  })
})
