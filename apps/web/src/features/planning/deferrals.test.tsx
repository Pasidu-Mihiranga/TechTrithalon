import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DeferDecisionFields, EMPTY_DEFER_DECISION, deferDecisionBody, deferDecisionReady, type DeferDecision } from './DeferDecisionFields'
import { DeferredOrdersPage } from './PlanningPendingPages'
import { StoreDeferralNotices } from '../ordering/StoreDeferralNotices'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function setup(element: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>)
}
const record = {
  id: 7, orderId: 901, orderRef: 'SYN-901', outletId: 'OUT901', brand: 'Fresh', tempRequirement: 'chilled', planId: 3,
  planDate: '2026-06-26', nextPlanningDate: '2026-06-27', depot: 'Synthetic', reasonCode: 'NO_REEFER', ruleCode: 'TEMPERATURE_COMPATIBILITY',
  reason: 'Synthetic reefer shortfall', protectNextRun: true, notifyStore: true, consecutiveDeferrals: 2, evidence: {},
  decidedByName: 'Synthetic dispatcher', decidedAt: '2026-06-25T11:00:00Z', recordedAt: '2026-06-25T11:05:00Z', acknowledgedAt: null,
  currentOrderStatus: 'deferred',
}

function Harness({ onBody }: { onBody: (body: ReturnType<typeof deferDecisionBody>, ready: boolean) => void }) {
  const [value, setValue] = useState<DeferDecision>(EMPTY_DEFER_DECISION)
  onBody(deferDecisionBody(value), deferDecisionReady(value))
  return <DeferDecisionFields idPrefix="t" value={value} onChange={setValue} orderLabel={() => 'SYN-901'}
    fairness={[{ orderId: 901, deferredPreviousOperatingDay: true, priorConsecutiveDeferrals: 1, lastDeferralDate: '2026-06-25',
      daysSinceLastServed: 3, evidenceSource: 'history', carriedForward: true, carriedFromDate: '2026-06-25', protectedThisRun: true }]} />
}

describe('deferral decisions and history', () => {
  it('requires a reason code and explanation and explains a repeat skip from server evidence', async () => {
    let latest: { body: ReturnType<typeof deferDecisionBody>; ready: boolean } | undefined
    setup(<Harness onBody={(body, ready) => { latest = { body, ready } }} />)
    expect(screen.getByText(/SYN-901 will be skipped 2 operating days in a row/)).toBeVisible()
    expect(screen.getByText(/carried into this run as protected from 2026-06-25/)).toBeVisible()
    expect(latest?.ready).toBe(false)
    await userEvent.selectOptions(screen.getByLabelText('Reason for deferral'), 'NO_REEFER')
    await userEvent.type(screen.getByLabelText('Explanation'), 'Reefer full')
    await userEvent.click(screen.getByLabelText(/Notify the store manager/))
    expect(latest).toEqual({ ready: true, body: { reasonCode: 'NO_REEFER', reason: 'Reefer full', nextDeliveryDate: undefined, protectNextRun: true, notifyStore: false } })
  })

  it('shows server totals for a run and an honest empty state', async () => {
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      const url = new URL(request.url)
      if (url.pathname.endsWith('/summary')) return json({ demoOperatingDate: '2026-06-26' })
      if (url.pathname.endsWith('/depots')) return json(['Synthetic'])
      return json({ planDate: '2026-06-26', depot: 'Synthetic', deferredOrders: 1, protectedNextRun: 1, repeatSkips: 1,
        storesNotified: 1, storesAcknowledged: 0, items: [record] })
    }))
    const view = setup(<DeferredOrdersPage />)
    expect(await screen.findByRole('button', { name: 'SYN-901' })).toBeVisible()
    expect(screen.getByText('2nd skip')).toBeVisible()
    expect(screen.getByText('0 / 1')).toBeVisible()
    // Nothing is selected until the dispatcher chooses an order.
    expect(screen.getByText(/Select an order to see who deferred it/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'SYN-901' }))
    const panel = within(document.querySelector('dl[aria-label="Deferral record"]') as HTMLElement)
    expect(panel.getByText('TEMPERATURE_COMPATIBILITY')).toBeVisible()
    expect(panel.getByText(/Synthetic dispatcher/)).toBeVisible()
    expect(panel.getByText('2 operating days')).toBeVisible()
    expect(panel.getByText('Not recorded')).toBeVisible()
    expect(panel.getByText(/2026-06-27, protected: first priority/)).toBeVisible()
    // Filters use the server's own counts and rows.
    await userEvent.click(screen.getByRole('button', { name: /Protected \(1\)/ }))
    expect(screen.getByRole('button', { name: 'SYN-901' })).toBeVisible()
    await userEvent.type(screen.getByLabelText('Search order or outlet'), 'nothing-matches')
    expect(screen.getByText('No matching deferrals')).toBeVisible()
    view.unmount()
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      const url = new URL(request.url)
      if (url.pathname.endsWith('/summary')) return json({ demoOperatingDate: '2026-06-26' })
      if (url.pathname.endsWith('/depots')) return json(['Synthetic'])
      return json({ planDate: '2026-06-26', depot: 'Synthetic', deferredOrders: 0, protectedNextRun: 0, repeatSkips: 0,
        storesNotified: 0, storesAcknowledged: 0, items: [] })
    }))
    setup(<DeferredOrdersPage />)
    expect(await screen.findByText('No deferrals for this run')).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('lets the store acknowledge a notice without promising an arrival time', async () => {
    let acknowledged = false
    const fetchSpy = vi.fn(async (request: Request) => {
      if (request.method === 'POST') { acknowledged = true; return json({ ...record, acknowledgedAt: '2026-06-25T12:00:00Z' }) }
      return json([acknowledged ? { ...record, acknowledgedAt: '2026-06-25T12:00:00Z' } : record])
    })
    vi.stubGlobal('fetch', fetchSpy)
    setup(<StoreDeferralNotices />)
    expect(await screen.findByText(/moves to the 2026-06-27 planning run/)).toBeVisible()
    expect(screen.getByText(/confirmed only after that run is planned/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    await waitFor(() => expect(screen.getByText('Acknowledged.')).toBeVisible())
    const post = fetchSpy.mock.calls.map(([req]) => req).find(req => req.method === 'POST')!
    expect(new URL(post.url).pathname).toBe('/api/v1/store/deferrals/7/acknowledge')
  })
})
