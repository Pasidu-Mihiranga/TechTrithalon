import { createContext, useContext, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/apiClient'
import type { components } from '../../generated/api'
import type { RoleKey } from '../../app/roles'

export type SessionUser = components['schemas']['UserResponse']
const sessionKey = ['session'] as const

export function roleKey(role: SessionUser['role']): RoleKey {
  switch (role) {
    case 'DISPATCHER': return 'dispatcher'
    case 'STORE_MANAGER': return 'store'
    case 'LOADER': return 'loader'
    case 'DRIVER': return 'driver'
    default: throw new Error('The server returned an unsupported role')
  }
}

export class AuthError extends Error {
  constructor(message: string, readonly traceId?: string, readonly retryAfter?: string | null) { super(message) }
}

/**
 * Drivers work offline, so the phone keeps the last identity the server confirmed and uses it only
 * when the server cannot be reached. It grants nothing: every sync is still authenticated by the
 * session cookie, and a 401 or sign-out clears it. Other roles always need a connection.
 */
const OFFLINE_DRIVER = 'waypoint:offline-driver'
function rememberDriver(user: SessionUser | null) {
  try {
    if (user?.role === 'DRIVER') localStorage.setItem(OFFLINE_DRIVER, JSON.stringify(user))
    else localStorage.removeItem(OFFLINE_DRIVER)
  } catch { /* storage unavailable: the app simply needs a connection to open */ }
}
function offlineDriver(): SessionUser | null {
  try { const saved = localStorage.getItem(OFFLINE_DRIVER); return saved ? JSON.parse(saved) as SessionUser : null } catch { return null }
}

async function restoreSession(): Promise<SessionUser | null> {
  let result
  try { result = await api.GET('/api/v1/auth/me') } catch {
    const saved = offlineDriver()
    if (saved) return saved
    throw new AuthError('No connection. Connect to the network to sign in.')
  }
  const { data, response } = result
  if (response.status === 401) { rememberDriver(null); return null }
  if (!response.ok || !data) throw new AuthError('Could not restore your session. Try again.', response.headers.get('X-Request-Id') ?? undefined)
  roleKey(data.role)
  rememberDriver(data)
  return data
}

function useSession() {
  const client = useQueryClient()
  const session = useQuery({
    queryKey: sessionKey,
    queryFn: async () => {
      const user = await restoreSession()
      const previous = client.getQueryData<SessionUser | null>(sessionKey)
      if (previous && previous.id !== user?.id) {
        await client.cancelQueries({ predicate: (query) => query.queryKey[0] !== 'session' })
        client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' })
      }
      return user
    },
    retry: false,
    staleTime: 0,
    // Offline, restoreSession falls back to the remembered driver instead of the query pausing.
    networkMode: 'always',
  })
  useEffect(() => {
    const expire = () => {
      void client.cancelQueries().then(() => {
        client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' })
        client.setQueryData(sessionKey, null)
        rememberDriver(null)
      })
    }
    window.addEventListener('waypoint:session-expired', expire)
    return () => window.removeEventListener('waypoint:session-expired', expire)
  }, [client])
  return {
    user: session.data ?? null,
    loading: session.isPending,
    error: session.error,
    retry: () => { void session.refetch() },
    async login(username: string, password: string, rememberMe: boolean) {
      const { data, response } = await api.POST('/api/v1/auth/login', { body: { username, password, rememberMe } })
      if (!response.ok || !data) {
        const message = response.status === 401 ? 'Incorrect user ID or password.'
          : response.status === 429 ? 'Too many failed sign-in attempts. Please wait before trying again.'
          : 'Sign-in could not be completed. Try again.'
        throw new AuthError(message, response.headers.get('X-Request-Id') ?? undefined, response.headers.get('Retry-After'))
      }
      roleKey(data.role)
      rememberDriver(data)
      await client.cancelQueries()
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' })
      client.setQueryData(sessionKey, data)
      return data
    },
    async logout() {
      const { response } = await api.POST('/api/v1/auth/logout')
      if (!response.ok && response.status !== 401) throw new AuthError('Sign-out failed. Try again.', response.headers.get('X-Request-Id') ?? undefined)
      rememberDriver(null)
      await client.cancelQueries()
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' })
      client.setQueryData(sessionKey, null)
    },
  }
}

const AuthContext = createContext<ReturnType<typeof useSession> | null>(null)
export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useSession()
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('AuthProvider is required')
  return auth
}
