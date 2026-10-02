import { useState } from 'react'
import { useAuth } from '../features/auth/auth'
import { Outlet, useNavigate } from 'react-router-dom'
import { AppShell, Button, ErrorState, Select, Sidebar, SystemStatus, TopBar } from '../components'
import { useQuery } from '@tanstack/react-query'
import { api, apiReadError } from '../lib/apiClient'
import type { RoleConfig } from './roles'

/** One shell for every role; the navigation comes from the role's config. */
export function RoleShell({ role }: { role: RoleConfig }) {
  const navigate = useNavigate()
  const auth = useAuth()
  const [depot, setDepot] = useState('')
  const depots = useQuery({
    queryKey: ['reference', 'depots'],
    enabled: role.key === 'dispatcher',
    retry: false,
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/reference/depots')
      if (!data) throw apiReadError(response, 'Depots could not be loaded')
      return data.filter((name): name is string => Boolean(name))
    },
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function logout() {
    setPending(true)
    setError(null)
    try { await auth.logout() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Sign-out failed. Try again.') }
    finally { setPending(false) }
  }
  return (
    <AppShell
      sidebar={<Sidebar roleLabel={role.label} items={role.pages} footerItems={role.footerPages} status={<SystemStatus />} />}
      topBar={<TopBar leading={role.key === 'dispatcher' ? <Select label="Workspace depot" value={depot} disabled={depots.isPending || depots.isError} onChange={(event) => setDepot(event.target.value)} options={[{ value: '', label: auth.user?.depot || 'All accessible depots' }, ...(depots.data ?? []).map((name) => ({ value: name, label: name }))]} /> : undefined} searchEnabled={role.key === 'dispatcher'} onSearch={(query) => navigate(`/dispatcher/orders?q=${encodeURIComponent(query)}`)} searchPlaceholder="Search orders, outlets…" user={<div className="auth-user"><span>{auth.user?.displayName}</span><Button variant="ghost" loading={pending} onClick={() => { void logout() }}>Sign out</Button></div>} />}
    >
      {error && <ErrorState message={error} />}
      {role.key === 'dispatcher' && depots.isError && <ErrorState error={depots.error} message="Workspace depots could not be loaded." onRetry={() => void depots.refetch()} />}
      <Outlet key={depot} context={{ depot: depot || undefined }} />
    </AppShell>
  )
}
