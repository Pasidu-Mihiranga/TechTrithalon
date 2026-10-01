import { Outlet } from 'react-router-dom'
import { AppShell, Sidebar, SystemStatus, TopBar } from '../components'
import type { RoleConfig } from './roles'

/** One shell for every role; the navigation comes from the role's config. */
export function RoleShell({ role }: { role: RoleConfig }) {
  return (
    <AppShell
      sidebar={<Sidebar roleLabel={role.label} items={role.pages} footerItems={role.footerPages} status={<SystemStatus />} />}
      topBar={<TopBar searchPlaceholder="Search orders, outlets…" user={<span>{role.label}</span>} />}
    >
      <Outlet />
    </AppShell>
  )
}
