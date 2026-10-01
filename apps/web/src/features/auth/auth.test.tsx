import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './auth'
import { AppRoutes } from '../../app/routes'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const operator = { id: 901, username: 'synthetic-user', displayName: 'Synthetic operator', role: 'STORE_MANAGER', outletId: 'OUT901', depot: null }
function setup(path = '/login') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter></QueryClientProvider>)
  return { ...view, client }
}
const offlineHealth = () => json({ service: 'api', status: 'ok', intelligence: 'unavailable' })

describe('authentication flow', () => {
  it('waits for session restore without showing a protected workspace', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Promise(() => {})))
    setup('/store')
    expect(screen.getByRole('status', { name: 'Restoring session' })).toBeVisible()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })
  it('redirects anonymous users to login and signs in to the server-selected role', async () => {
    const fetchSpy = vi.fn(async (request: Request) => request.url.endsWith('/me') ? json({}, 401)
      : request.url.endsWith('/login') ? json(operator) : offlineHealth())
    vi.stubGlobal('fetch', fetchSpy)
    const { client } = setup('/dispatcher')
    await screen.findByRole('heading', { name: 'Waypoint Login' })
    client.setQueryData(['private', 'previous-user'], { secret: 'synthetic' })
    await userEvent.type(screen.getByLabelText('USER ID'), 'synthetic-user')
    await userEvent.type(screen.getByLabelText('PASSWORD'), 'synthetic-password')
    await userEvent.click(screen.getByLabelText('Remember me'))
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))
    expect(await screen.findByRole('complementary', { name: 'Store manager navigation' })).toBeVisible()
    const request = fetchSpy.mock.calls.map(([req]) => req).find(req => req.url.endsWith('/login'))!
    expect(request.credentials).toBe('include')
    expect(request.headers.get('X-Requested-With')).toBe('Waypoint')
    expect(await request.clone().json()).toEqual({ username: 'synthetic-user', password: 'synthetic-password', rememberMe: true })
    expect(client.getQueryData(['private', 'previous-user'])).toBeUndefined()
  })
  it('restores a session and redirects from the root to its role', async () => {
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => request.url.endsWith('/me') ? json(operator) : offlineHealth()))
    setup('/')
    expect(await screen.findByRole('complementary', { name: 'Store manager navigation' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Waypoint Login' })).not.toBeInTheDocument()
  })
  it('shows credential failures without saving the password', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 401, { 'X-Request-Id': 'synthetic-trace' })))
    setup()
    await screen.findByLabelText('USER ID')
    await userEvent.type(screen.getByLabelText('USER ID'), 'synthetic-user')
    await userEvent.type(screen.getByLabelText('PASSWORD'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect user ID or password.')
    expect(screen.getByLabelText('PASSWORD')).toHaveValue('')
    expect(screen.getByRole('alert')).toHaveTextContent('synthetic-trace')
    expect(localStorage.length).toBe(0)
  })
  it('shows throttle feedback and password visibility has an accessible toggle', async () => {
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => request.url.endsWith('/me') ? json({}, 401) : json({}, 429, { 'Retry-After': '42' })))
    setup()
    await screen.findByLabelText('PASSWORD')
    await userEvent.type(screen.getByLabelText('USER ID'), 'synthetic-user')
    await userEvent.type(screen.getByLabelText('PASSWORD'), 'synthetic-password')
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('PASSWORD')).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(screen.getByLabelText('PASSWORD')).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 42 seconds.')
  })
  it('signs out and clears private query data', async () => {
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => request.url.endsWith('/me') ? json(operator)
      : request.url.endsWith('/logout') ? new Response(null, { status: 204 }) : offlineHealth()))
    const { client } = setup('/store')
    await screen.findByRole('button', { name: 'Sign out' })
    client.setQueryData(['private'], 'synthetic-secret')
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Waypoint Login' })).toBeVisible()
    expect(client.getQueryData(['private'])).toBeUndefined()
  })
  it('keeps the session visible if logout fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => request.url.endsWith('/me') ? json(operator) : request.url.endsWith('/logout') ? json({}, 500) : offlineHealth()))
    setup('/store')
    await screen.findByRole('button', { name: 'Sign out' })
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-out failed')
    expect(screen.getByRole('complementary')).toBeVisible()
  })
  it('shows a recoverable session error rather than pretending the user is anonymous', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 500)))
    setup('/store')
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Waypoint Login' })).not.toBeInTheDocument()
  })
  it('clears private data when session restoration finds a different signed-in actor', async () => {
    let current = operator
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => request.url.endsWith('/me') ? json(current) : offlineHealth()))
    const { client } = setup('/store')
    await screen.findByRole('complementary')
    client.setQueryData(['private'], 'previous-actor-data')
    current = { ...operator, id: 902, role: 'DRIVER' }
    await act(async () => { await client.invalidateQueries({ queryKey: ['session'] }) })
    expect(await screen.findByText('Access denied')).toBeVisible()
    expect(client.getQueryData(['private'])).toBeUndefined()
  })
  it('returns to login and clears private data when a protected API reports expiry', async () => {
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => request.url.endsWith('/me') ? json(operator) : offlineHealth()))
    const { client } = setup('/store')
    await screen.findByRole('complementary')
    client.setQueryData(['private'], 'synthetic-secret')
    await act(async () => { window.dispatchEvent(new Event('waypoint:session-expired')) })
    expect(await screen.findByRole('heading', { name: 'Waypoint Login' })).toBeVisible()
    expect(client.getQueryData(['private'])).toBeUndefined()
  })
})
