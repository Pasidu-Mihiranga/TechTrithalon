import { describe, expect, it, vi } from 'vitest'
import { loadSelectedPlanningOrders } from './orderQueries'
import { planningOrdersCsv } from './orderDisplay'

describe('selected planning export', () => {
  it('loads IDs across pages and escapes CSV fields without changing backend volume', async () => {
    const rows = [
      { id: 901, ref: 'SYN-901', outletId: 'SYN001', district: 'Alpha, "North"', volumeM3: 1.25, tempRequirement: 'ambient', orderDate: '2026-06-26', planningDate: '2026-06-26', depot: 'Synthetic', status: 'confirmed' },
      { id: 912, ref: 'SYN-912', outletId: 'SYN002', district: 'Beta', volumeM3: 0.64, tempRequirement: 'chilled', orderDate: '2026-06-26', planningDate: '2026-06-26', depot: 'Synthetic', status: 'confirmed' },
    ]
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      const id = Number(new URL(request.url).pathname.split('/').at(-1))
      return new Response(JSON.stringify(rows.find(row => row.id === id)), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    const selected = await loadSelectedPlanningOrders([901, 912], '2026-06-26', 'Synthetic')
    expect(selected.map(row => row.id)).toEqual([901, 912])
    expect(planningOrdersCsv(selected)).toContain('"Alpha, ""North""","1.25"')
    expect(planningOrdersCsv(selected)).toContain('"SYN-912"')
  })

  it('rejects changed scope/status and failed reads instead of exporting a partial selection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ outletId: 'SYN001', orderDate: '2026-06-26', depot: 'Synthetic', status: 'planned' }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await expect(loadSelectedPlanningOrders([901], '2026-06-26', 'Synthetic')).rejects.toThrow('no longer eligible')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    await expect(loadSelectedPlanningOrders([901], '2026-06-26', 'Synthetic')).rejects.toThrow()
  })
})
