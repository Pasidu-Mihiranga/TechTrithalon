import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { dispositionReplacement, ManualPlanRequestError, useCreateManualPlan, useEditManualPlan } from './manualPlanQueries'

function setup<T>(hook: () => T) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  return { ...renderHook(hook, { wrapper }), cache }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('manual plan API hooks', () => {
  it('records deferrals without losing another trip or existing disposition, and restores to the backlog', () => {
    const view = {
      plan: { id: 701, lockVersion: 4 },
      trips: [{ id: 801, vehicleId: 'SYN-V', brand: 'Fresh', district: 'Alpha', tripIndex: 1,
        stops: [{ orderId: 501 }, { orderId: 502 }] }],
      unassignedOrders: [{ order: { id: 503 }, disposition: 'DEFERRED', reason: 'Synthetic existing reason', reasonCode: 'CAPACITY', protectNextRun: false, notifyStore: true }],
    }
    const command = dispositionReplacement(view, [{ orderId: 501, reason: 'Synthetic queue reason', nextDeliveryDate: '2026-06-27', reasonCode: 'VAN_ACCESS' }])
    expect(command.expectedVersion).toBe(4)
    expect(command.trips[0].orderIds).toEqual([502])
    expect(command.dispositions).toEqual([
      { orderId: 503, code: 'DEFERRED', reason: 'Synthetic existing reason', nextDeliveryDate: undefined, reasonCode: 'CAPACITY', protectNextRun: false, notifyStore: true },
      { orderId: 501, code: 'DEFERRED', reason: 'Synthetic queue reason', nextDeliveryDate: '2026-06-27', reasonCode: 'VAN_ACCESS', protectNextRun: true, notifyStore: true },
    ])
    const restored = dispositionReplacement(view, [{ orderId: 503 }])
    expect(restored.dispositions).toEqual([])
    expect(restored.trips[0].orderIds).toEqual([501, 502])
  })
  it('creates from a snapshot and caches the server-produced candidate', async () => {
    let body: unknown
    const view = { plan: { id: 701, lockVersion: 0, status: 'candidate' }, validation: { feasible: true } }
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => { body = await request.json(); return json(view, 201) }))
    const { result, cache } = setup(() => useCreateManualPlan())
    await act(async () => { await result.current.mutateAsync({ snapshotId: 601, reason: 'Synthetic dispatcher review' }) })
    expect(body).toEqual({ snapshotId: 601, reason: 'Synthetic dispatcher review' })
    expect(cache.getQueryData(['dispatcher', 'manual-plan', 701])).toEqual(view)
  })
  it('retains rule evidence and preserves the last saved candidate after an invalid move', async () => {
    const saved = { plan: { id: 701, lockVersion: 2, status: 'candidate' } }
    const payload = { code: 'PLAN_INFEASIBLE', traceId: 'synthetic-trace', detail: 'Invalid temperature', violations: [{ ruleCode: 'TEMP_COMPATIBILITY' }] }
    const fetch = vi.fn(async () => json(payload, 422))
    vi.stubGlobal('fetch', fetch)
    const { result, cache } = setup(() => useEditManualPlan(701))
    cache.setQueryData(['dispatcher', 'manual-plan', 701], saved)
    let failure: unknown
    await act(async () => {
      try { await result.current.mutateAsync({ operation: 'move', body: { expectedVersion: 2, reason: 'Synthetic move', orderId: 501, toTripId: 801 } }) }
      catch (error) { failure = error }
    })
    expect(failure).toBeInstanceOf(ManualPlanRequestError)
    expect(failure).toMatchObject({ status: 422, code: 'PLAN_INFEASIBLE', traceId: 'synthetic-trace', violations: payload.violations })
    expect(cache.getQueryData(['dispatcher', 'manual-plan', 701])).toEqual(saved)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('sends the displayed version and invalidates operational reads after publication', async () => {
    let body: unknown
    const view = { plan: { id: 701, lockVersion: 3, status: 'published' } }
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => { body = await request.json(); return json(view) }))
    const { result, cache } = setup(() => useEditManualPlan(701))
    cache.setQueryData(['dispatcher', 'orders', 'synthetic'], { total: 1 })
    await act(async () => { await result.current.mutateAsync({ operation: 'publish', body: { expectedVersion: 2, reason: 'Synthetic sign-off' } }) })
    expect(body).toEqual({ expectedVersion: 2, reason: 'Synthetic sign-off' })
    expect(cache.getQueryState(['dispatcher', 'orders', 'synthetic'])?.isInvalidated).toBe(true)
    expect(cache.getQueryData(['dispatcher', 'manual-plan', 701])).toEqual(view)
  })
})
