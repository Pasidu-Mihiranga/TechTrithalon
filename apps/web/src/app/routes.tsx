import { Navigate, Route, Routes } from 'react-router-dom'
import { ErrorState } from '../components'
import { DispatcherHome } from './DispatcherHome'
import { PlaceholderPage } from './PlaceholderPage'
import { RoleShell } from './RoleShell'
import { roles } from './roles'
import type { RoleConfig } from './roles'

function roleRoutes(role: RoleConfig) {
  const pages = [...role.pages, ...(role.footerPages ?? [])]
  return (
    <Route key={role.key} path={role.basePath} element={<RoleShell role={role} />}>
      {pages.map((page) => {
        const element = role.key === 'dispatcher' && page.end ? <DispatcherHome /> : <PlaceholderPage page={page} />
        return page.to === role.basePath
          ? <Route key={page.to} index element={element} />
          : <Route key={page.to} path={page.to.slice(role.basePath.length + 1)} element={element} />
      })}
    </Route>
  )
}

/**
 * Routes are grouped by role. Until authentication exists (Phase 2) the role is chosen by URL;
 * Phase 2 replaces this with a session-based redirect and route guards.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={roles.dispatcher.basePath} replace />} />
      {Object.values(roles).map(roleRoutes)}
      <Route path="*" element={<main className="shell-main"><ErrorState title="Page not found" message="That address does not exist." /></main>} />
    </Routes>
  )
}
