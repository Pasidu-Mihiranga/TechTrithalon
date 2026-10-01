import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './routes'

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>
    </QueryClientProvider>,
  )
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

describe('role shells', () => {
  it('renders every role shell from the shared components', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Promise(() => {})))
    for (const [path, role] of [['/dispatcher/orders', 'Dispatcher'], ['/store', 'Store manager'], ['/loader', 'Loader'], ['/driver', 'Driver']] as const) {
      const { unmount } = renderAt(path)
      expect(screen.getByRole('complementary', { name: `${role} navigation` })).toBeInTheDocument()
      expect(screen.getByRole('main')).toBeInTheDocument()
      unmount()
    }
  })

  it('marks the current page in the navigation', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Promise(() => {})))
    renderAt('/dispatcher/fleet')
    expect(screen.getByRole('link', { name: 'Fleet' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Orders' })).not.toHaveAttribute('aria-current')
  })

  it('shows an honest empty state, not sample data, for screens that are not built yet', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Promise(() => {})))
    renderAt('/dispatcher/forecast')
    expect(screen.getByRole('heading', { name: 'Capacity forecast' })).toBeInTheDocument()
    const empty = within(screen.getByRole('main')).getByRole('status')
    expect(empty).toHaveTextContent('Not available yet')
    expect(empty).toHaveTextContent('Phase 17')
  })

  it('shows real reference counts from the API on the dispatcher home', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: Request | string) => {
      const url = typeof input === 'string' ? input : input.url
      if (url.endsWith('/api/v1/reference/summary')) return json({ outlets: 120, vehicles: 60, calendarDays: 910, districts: 12, serviceAllowances: 9, demoOperatingDate: '2026-06-26' })
      return json({ service: 'api', status: 'ok', intelligence: 'reachable' })
    }))
    renderAt('/dispatcher')
    expect(await screen.findByText('120')).toBeVisible()
    expect(screen.getByText('60')).toBeVisible()
    expect(await screen.findByText('All systems operational')).toBeVisible()
  })

  it('shows an error state with retry when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } })))
    renderAt('/dispatcher')
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeVisible()
    expect(await screen.findByText('API unavailable')).toBeVisible()
  })

  it('shows not-found for unknown addresses', () => {
    renderAt('/nope')
    expect(screen.getByRole('alert')).toHaveTextContent('Page not found')
  })
})
