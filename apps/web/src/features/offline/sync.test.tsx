import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/auth'
import { fieldEngine, resetFieldEngine } from '../../lib/fieldSync'
import { SyncStatusPage } from './SyncStatusPage'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const user = { id: 4, username: 'SYN-DRV', displayName: 'Synthetic Driver', role: 'DRIVER', outletId: null, depot: null }

function serve(sync: (body: { actions: { clientActionId: string; actionType: string }[] }) => Response | object) {
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/auth/me')) return json(user)
    if (url.pathname.endsWith('/driver/sync')) { const r = sync(await request.clone().json()); return r instanceof Response ? r : json(r) }
    return json({ code: 'NOT_FOUND' }, 404)
  }))
}

function renderSync() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider><MemoryRouter initialEntries={['/driver/sync']}><Routes>
        <Route path="/driver/sync" element={<SyncStatusPage />} /><Route path="/driver" element={<p>Home</p>} />
      </Routes></MemoryRouter></AuthProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => { vi.unstubAllGlobals(); resetFieldEngine() })

describe('sync status', () => {
  it('shows saved actions while offline and the records to review once synced', async () => {
    let online = false
    serve(body => {
      if (!online) throw new TypeError('Failed to fetch')
      return { results: body.actions.map(a => ({ clientActionId: a.clientActionId, result: a.actionType === 'ORDER_OUTCOME' ? 'CONFLICT' : 'APPLIED',
        code: a.actionType === 'ORDER_OUTCOME' ? 'ORDER_ALREADY_RECORDED' : null,
        message: a.actionType === 'ORDER_OUTCOME' ? "This order's outcome is already recorded" : null, clockSkew: false })) }
    })
    const engine = fieldEngine('SYN-DRV')
    await engine.enqueueAction({ planDate: '2026-06-26', tripIndex: 1, actionType: 'STOP_ARRIVE', outletId: 'OUT901' }, 'Arrived at OUT901')
    await engine.enqueueAction({ planDate: '2026-06-26', tripIndex: 1, actionType: 'ORDER_OUTCOME', orderId: 1, outcome: 'DELIVERED', recipientName: 'S' }, 'SYN001: Delivered')
    await engine.sync()
    renderSync()
    expect(await screen.findByText('2 actions saved')).toBeVisible()
    expect(screen.getByText('Waiting to sync')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'View Saved Records' }))
    expect(screen.getByRole('region', { name: 'Saved records' })).toHaveTextContent('SYN001: Delivered')
    online = true
    await engine.sync()
    expect(await screen.findByText('1 record needs review')).toBeVisible()
    expect(screen.getByRole('region', { name: 'Records that need review' })).toHaveTextContent("SYN001: Delivered — This order's outcome is already recorded")
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(engine.getStatus().needsReview).toBe(0)
  })
})
