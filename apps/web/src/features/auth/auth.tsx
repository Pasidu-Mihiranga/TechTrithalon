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

async function restoreSession(): Promise<SessionUser | null> {
  const { data, response } = await api.GET('/api/v1/auth/me')
  if (response.status === 401) return null
  if (!response.ok || !data) throw new AuthError('Could not restore your session. Try again.', response.headers.get('X-Request-Id') ?? undefined)
  roleKey(data.role)
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
  })
  useEffect(() => {
    const expire = () => {
      void client.cancelQueries().then(() => {
        client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' })
        client.setQueryData(sessionKey, null)
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
      await client.cancelQueries()
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' })
      client.setQueryData(sessionKey, data)
      return data
    },
    async logout() {
      const { response } = await api.POST('/api/v1/auth/logout')
      if (!response.ok && response.status !== 401) throw new AuthError('Sign-out failed. Try again.', response.headers.get('X-Request-Id') ?? undefined)
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
