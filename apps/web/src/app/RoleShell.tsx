import { useState } from 'react'
import { useAuth } from '../features/auth/auth'
import { Outlet, useNavigate } from 'react-router-dom'
import { AppShell, Button, ErrorState, Sidebar, SystemStatus, TopBar } from '../components'
import type { RoleConfig } from './roles'

/** One shell for every role; the navigation comes from the role's config. */
export function RoleShell({ role }: { role: RoleConfig }) {
  const navigate = useNavigate()
  const auth = useAuth()
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
      topBar={<TopBar searchEnabled={role.key === 'dispatcher'} onSearch={(query) => navigate(`/dispatcher/orders?q=${encodeURIComponent(query)}`)} searchPlaceholder="Search orders, outlets…" user={<div className="auth-user"><span>{auth.user?.displayName}</span><Button variant="ghost" loading={pending} onClick={() => { void logout() }}>Sign out</Button></div>} />}
    >
      {error && <ErrorState message={error} />}
      <Outlet />
    </AppShell>
  )
}
