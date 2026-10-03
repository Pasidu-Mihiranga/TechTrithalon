import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Button, ErrorState, ForbiddenState, LoadingState } from '../components'
import { DispatcherHome } from './DispatcherHome'
import { DeferredOrdersPage, ExceptionsPage } from '../features/planning/PlanningPendingPages'
import { LiveOperationsPage } from '../features/live-ops/LiveOperationsPage'
import { CapacityForecastPage, CapacityDecisionPage } from '../features/forecast/CapacityPages'
import { DispatcherProfilePage } from '../features/auth/DispatcherProfilePage'
import { PlaceholderPage } from './PlaceholderPage'
import { RoleShell } from './RoleShell'
import { roles } from './roles'
import { LoginPage } from '../features/auth/LoginPage'
import { roleKey, useAuth } from '../features/auth/auth'
import { DispatcherOrdersPage } from '../features/ordering/DispatcherOrdersPage'
import { PlanningConfirmedOrdersPage } from '../features/ordering/PlanningConfirmedOrdersPage'
import { DispatcherOrderDetailPage, StoreOrderDetailPage } from '../features/ordering/OrderDetailPage'
import { PlaceOrderPage } from '../features/ordering/PlaceOrderPage'
import { StoreHomePage } from '../features/ordering/StoreHomePage'
import { StoreOrdersPage } from '../features/ordering/StoreOrdersPage'
import { FleetDetailPage } from '../features/fleet/FleetDetailPage'
import { FleetPage } from '../features/fleet/FleetPage'
import { ManualPlanningBoard } from '../features/planning/ManualPlanningBoard'
import type { ReactNode } from 'react'
import type { RoleConfig, RolePage } from './roles'

function pageElement(role: RoleConfig, page: RolePage) {
  if (role.key === 'dispatcher' && page.end) return <DispatcherHome />
  if (role.key === 'dispatcher' && page.to === '/dispatcher/orders') return <DispatcherOrdersPage />
  if (role.key === 'dispatcher' && page.to === '/dispatcher/planning') return <PlanningConfirmedOrdersPage />
  if (role.key === 'dispatcher' && page.to === '/dispatcher/fleet') return <FleetPage />
  if (role.key === 'store' && page.end && page.to === '/store') return <StoreHomePage />
  if (role.key === 'store' && page.to === '/store/orders') return <StoreOrdersPage />
  if (role.key === 'store' && page.to === '/store/orders/new') return <PlaceOrderPage />
  if (role.key === 'dispatcher') {
    if (page.to === '/dispatcher/deferred-orders') return <DeferredOrdersPage />
    if (page.to === '/dispatcher/exceptions') return <ExceptionsPage />
    if (page.to === '/dispatcher/live-operations') return <LiveOperationsPage />
    if (page.to === '/dispatcher/forecast') return <CapacityForecastPage />
    if (page.to === '/dispatcher/capacity-decision') return <CapacityDecisionPage />
    if (page.to === '/dispatcher/settings') return <DispatcherProfilePage />
  }
  return <PlaceholderPage page={page} />
}

function roleRoutes(role: RoleConfig) {
  const pages = [...role.pages, ...(role.footerPages ?? [])]
  return (
    <Route key={role.key} path={role.basePath} element={<SessionGuard role={role}><RoleShell role={role} /></SessionGuard>}>
      {pages.map((page) => {
        const element = pageElement(role, page)
        return page.to === role.basePath
          ? <Route key={page.to} index element={element} />
          : <Route key={page.to} path={page.to.slice(role.basePath.length + 1)} element={element} />
      })}
      {role.key === 'dispatcher' ? (
        <>
          <Route path="capacity-decision" element={<CapacityDecisionPage />} />
          <Route path="manual-planning" element={<ManualPlanningBoard />} />
          <Route path="orders/:id" element={<DispatcherOrderDetailPage />} />
          <Route path="fleet/:vehicleId" element={<FleetDetailPage />} />
        </>
      ) : null}
      {role.key === 'store' ? <Route path="orders/:id" element={<StoreOrderDetailPage />} /> : null}
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
