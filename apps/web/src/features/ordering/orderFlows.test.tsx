import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DispatcherOrdersPage } from './DispatcherOrdersPage'
import { PlanningConfirmedOrdersPage } from './PlanningConfirmedOrdersPage'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const row = { id: 901, ref: 'SYN-901', outletId: 'OUT901', status: 'confirmed', tempRequirement: 'ambient', volumeM3: 1 }
function setup(element: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>)
}

describe('confirmed order flows', () => {
  it('loads subsequent server pages with the same date and depot', async () => {
    const requests: URL[] = []
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      const url = new URL(request.url); requests.push(url)
      const page = Number(url.searchParams.get('page'))
      return json({ items: [{ ...row, ref: page === 0 ? 'SYN-FIRST' : 'SYN-NEXT' }], total: 51, page, size: 50 })
    }))
    setup(<DispatcherOrdersPage date="2026-06-26" depot="Synthetic depot" />)
    await screen.findByText('SYN-FIRST')
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await screen.findByText('SYN-NEXT')
    expect(requests[1].searchParams.get('page')).toBe('1')
    expect(requests[1].searchParams.get('date')).toBe('2026-06-26')
    expect(requests[1].searchParams.get('depot')).toBe('Synthetic depot')
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })
  it('shows forbidden and empty states without manufactured rows', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ code: 'FORBIDDEN' }, 403)))
    const view = setup(<DispatcherOrdersPage />)
    await screen.findByText('Access denied')
    view.unmount()
    vi.stubGlobal('fetch', vi.fn(async () => json({ items: [], total: 0, page: 0, size: 50 })))
    setup(<DispatcherOrdersPage />)
    await screen.findByText('No orders')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
  it('freezes the visible scope and offers regeneration when inputs drift', async () => {
    let postBody: unknown
    const snapshot = { id: 991, planDate: '2026-06-26', depot: 'Synthetic depot', orderIds: [901], selectionMode: 'all', contentHash: 'a'.repeat(64), inputs: { orders: [{ ...row, weightKg: 10 }] } }
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      const url = new URL(request.url)
      if (url.pathname.endsWith('/summary')) return json({ demoOperatingDate: '2026-06-26' })
      if (url.pathname.endsWith('/depots')) return json(['Synthetic depot'])
      if (url.pathname.endsWith('/compare')) return json({ unchanged: false })
      if (request.method === 'POST') { postBody = await request.clone().json(); return json(snapshot, 201) }
      return json({ items: [row], total: 1, page: 0, size: 50 })
    }))
    setup(<PlanningConfirmedOrdersPage />)
    await screen.findByText('SYN-901')
    await userEvent.click(screen.getByRole('button', { name: 'Snapshot all confirmed' }))
    await screen.findByText('Inputs changed. Regenerate before planning.')
    expect(postBody).toEqual({ planDate: '2026-06-26', depot: 'Synthetic depot' })
    expect(screen.getByRole('button', { name: 'Regenerate snapshot' })).toBeVisible()
    await userEvent.selectOptions(screen.getByLabelText('Depot'), 'Synthetic depot')
    await waitFor(() => expect(screen.queryByLabelText('Frozen snapshot')).not.toBeInTheDocument())
  })
})
