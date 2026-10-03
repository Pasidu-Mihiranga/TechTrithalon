import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './routes'
import { AuthProvider } from '../features/auth/auth'

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter></QueryClientProvider>)
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const syntheticUser = (role = 'DISPATCHER') => ({ id: 901, username: 'synthetic-user', displayName: 'Synthetic operator', role, outletId: null, depot: null })
function signedIn(role = 'DISPATCHER', handler?: (url: string) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: Request) => {
    if (input.url.endsWith('/api/v1/auth/me')) return json(syntheticUser(role))
    if (handler) return handler(input.url)
    return new Promise<Response>(() => {})
  }))
}

describe('authenticated role shells', () => {
  it('renders every role shell from the shared components', async () => {
    for (const [path, label, role] of [['/dispatcher/orders', 'Dispatcher', 'DISPATCHER'], ['/store', 'Store manager', 'STORE_MANAGER']] as const) {
      signedIn(role)
      const { unmount } = renderAt(path)
      expect(await screen.findByRole('complementary', { name: `${label} navigation` })).toBeInTheDocument()
      expect(screen.getByRole('main')).toBeInTheDocument()
      expect(screen.getByText('Synthetic operator')).toBeVisible()
      unmount()
    }
  })
  it('gives the driver the Figma phone tab bar instead of the sidebar', async () => {
    signedIn('DRIVER')
    renderAt('/driver')
    const nav = await screen.findByRole('navigation', { name: 'Driver navigation' })
    expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(['Home', 'Trip', 'Deliveries', 'Profile'])
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
  it('gives the loader the Figma top navigation instead of the sidebar', async () => {
    signedIn('LOADER')
    renderAt('/loader')
    const nav = await screen.findByRole('navigation', { name: 'Loader navigation' })
    for (const name of ['Home', 'Issues', 'Profile']) expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Your profile' })).toHaveTextContent('SO')
    expect(screen.queryByRole('complementary', { name: 'Loader navigation' })).toBeNull()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
  it('marks the current page in the navigation', async () => {
    signedIn()
    renderAt('/dispatcher/fleet')
    expect(await screen.findByRole('link', { name: 'Fleet' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Orders' })).not.toHaveAttribute('aria-current')
  })
  it('shows an honest empty state for screens that are not built yet', async () => {
    signedIn()
    renderAt('/dispatcher/forecast')
    expect(await screen.findByRole('heading', { name: 'Capacity forecast' })).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getAllByRole('status')[0]).toHaveTextContent('Not available yet')
    expect(within(screen.getByRole('main')).getAllByRole('status')[0]).toHaveTextContent('Phases 17')
  })
  it('shows dashboard metrics returned by the API', async () => {
    signedIn('DISPATCHER', async (url) => {
      if (url.includes('/api/v1/dispatcher/dashboard')) {
        return json({
          date: '2026-06-26',
          depot: 'Peliyagoda',
          ordersToPlan: { value: 7, available: true },
          ordersPlanned: { available: false, availableFromPhase: 'Phase 7' },
          tripsReady: { available: false, availableFromPhase: 'Phase 11' },
          activeTrips: { available: false, availableFromPhase: 'Phase 16' },
          exceptions: { available: false, availableFromPhase: 'Phase 10' },
          orderAttention: [],
          tripAttention: [],
          planningProgress: { available: false, availableFromPhase: 'Phase 7' },
        })
      }
      return json({ service: 'api', status: 'ok', intelligence: 'reachable' })
    })
    renderAt('/dispatcher')
    expect(await screen.findByText('7')).toBeVisible()
    expect(screen.getByText('Orders to plan')).toBeVisible()
    expect(screen.getByText(/Available in Phase 7/)).toBeVisible()
    expect(await screen.findByText('All systems operational')).toBeVisible()
  })
  it('shows an error state with retry when a feature API fails', async () => {
    signedIn('DISPATCHER', async (url) => {
      if (url.includes('/api/v1/system/health')) return json({}, 500)
      if (url.includes('/api/v1/dispatcher/dashboard')) {
        return json({
          date: '2026-06-26', depot: 'Peliyagoda',
          ordersToPlan: { value: 1, available: true },
          ordersPlanned: { available: false, availableFromPhase: 'Phase 7' },
          tripsReady: { available: false, availableFromPhase: 'Phase 11' },
          activeTrips: { available: false, availableFromPhase: 'Phase 16' },
          exceptions: { available: false, availableFromPhase: 'Phase 10' },
          orderAttention: [], tripAttention: [],
          planningProgress: { available: false, availableFromPhase: 'Phase 7' },
        })
      }
      return json({}, 500)
    })
    renderAt('/dispatcher')
    expect(await screen.findByText('API unavailable')).toBeVisible()
  })
  it('is keyboard navigable after session restoration', async () => {
    signedIn()
    renderAt('/dispatcher')
    await screen.findByRole('link', { name: 'Skip to content' })
    await userEvent.tab()
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus()
    for (const name of ['Home', 'Orders', 'Planning', 'Live Operations', 'Forecast', 'Fleet', 'Exceptions', 'Deferred Orders', 'Settings']) {
      await userEvent.tab()
      expect(screen.getByRole('link', { name })).toHaveFocus()
    }
  })
  it('shows not-found for unknown addresses', () => {
    signedIn()
    renderAt('/nope')
    expect(screen.getByRole('alert')).toHaveTextContent('Page not found')
  })
  it('rejects every other role workspace before rendering its content', async () => {
    const paths = ['/dispatcher', '/store', '/loader', '/driver']
    const roleNames = ['DISPATCHER', 'STORE_MANAGER', 'LOADER', 'DRIVER']
    for (let i = 0; i < paths.length; i++) {
      for (let j = 0; j < paths.length; j++) {
        if (i === j) continue
        signedIn(roleNames[i])
        const { unmount } = renderAt(paths[j])
        expect(await screen.findByText('Access denied')).toBeVisible()
        expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
        unmount()
      }
    }
  })
})
