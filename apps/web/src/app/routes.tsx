import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Button, ErrorState, ForbiddenState, LoadingState } from '../components'
import { DispatcherHome } from './DispatcherHome'
import { PlaceholderPage } from './PlaceholderPage'
import { RoleShell } from './RoleShell'
import { roles } from './roles'
import { LoginPage } from '../features/auth/LoginPage'
import { roleKey, useAuth } from '../features/auth/auth'
import type { ReactNode } from 'react'
import type { RoleConfig } from './roles'

function roleRoutes(role: RoleConfig) {
  const pages = [...role.pages, ...(role.footerPages ?? [])]
  return (
    <Route key={role.key} path={role.basePath} element={<SessionGuard role={role}><RoleShell role={role} /></SessionGuard>}>
      {pages.map((page) => {
        const element = role.key === 'dispatcher' && page.end ? <DispatcherHome /> : <PlaceholderPage page={page} />
        return page.to === role.basePath
          ? <Route key={page.to} index element={element} />
          : <Route key={page.to} path={page.to.slice(role.basePath.length + 1)} element={element} />
      })}
    </Route>
  )
}

function SessionGuard({ role, children }: { role?: RoleConfig; children?: ReactNode }) {
  const auth = useAuth()
  const navigate = useNavigate()
  if (auth.loading) return <main className="auth-state"><LoadingState label="Restoring session" /></main>
  if (auth.error) return <main className="auth-state"><ErrorState message={auth.error.message} onRetry={auth.retry} /></main>
  if (!auth.user) return <Navigate to="/login" replace />
  const ownRole = roles[roleKey(auth.user.role)]
  if (!role) return <Navigate to={ownRole.basePath} replace />
  if (role.key !== ownRole.key) return <main className="auth-state"><ForbiddenState action={<Button onClick={() => navigate(ownRole.basePath)}>Go to my workspace</Button>} /></main>
  return children
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SessionGuard />} />
      <Route path="/login" element={<LoginPage />} />
      {Object.values(roles).map(roleRoutes)}
      <Route path="*" element={<main className="shell-main"><ErrorState title="Page not found" message="That address does not exist." /></main>} />
    </Routes>
  )
}
