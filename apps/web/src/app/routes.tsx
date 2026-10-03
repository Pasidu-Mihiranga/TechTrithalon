import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Button, ErrorState, ForbiddenState, LoadingState } from '../components'
import { DispatcherHome } from './DispatcherHome'
import { DeferredOrdersPage } from '../features/planning/PlanningPendingPages'
import { ExceptionsPage } from '../features/planning/ExceptionsPage'
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
import { LoaderHomePage } from '../features/loading/LoaderHomePage'
import { LoaderIssuesPage } from '../features/loading/LoaderIssuesPage'
import { LoaderOrderPage } from '../features/loading/LoaderOrderPage'
import { LoaderProfilePage } from '../features/loading/LoaderProfilePage'
import { LoaderShortfallPage } from '../features/loading/LoaderShortfallPage'
import { LoaderTripPage } from '../features/loading/LoaderTripPage'
import { DriverHomePage } from '../features/delivery/DriverHomePage'
import { DriverCurrentTripPage, DriverTripPage } from '../features/delivery/DriverTripPage'
import { DriverRoutePage } from '../features/delivery/DriverRoutePage'
import { DriverStopPage } from '../features/delivery/DriverStopPage'
import { DriverOrderPage } from '../features/delivery/DriverOrderPage'
import { DriverRecordPage } from '../features/delivery/DriverRecordPage'
import { DriverTripDonePage } from '../features/delivery/DriverTripDonePage'
import { DriverDeliveriesPage } from '../features/delivery/DriverDeliveriesPage'
import { DriverDeliveryDetailPage } from '../features/delivery/DriverDeliveryDetailPage'
import { DriverProfilePage } from '../features/delivery/DriverProfilePage'
import { SyncStatusPage } from '../features/offline/SyncStatusPage'
import { StoreDeliveriesPage } from '../features/receipt/StoreDeliveriesPage'
import { ConfirmReceiptPage } from '../features/receipt/ConfirmReceiptPage'
import { ReportIssuePage } from '../features/receipt/ReportIssuePage'
import { StoreIssuesPage } from '../features/receipt/StoreIssuesPage'
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
  if (role.key === 'store' && page.to === '/store/deliveries') return <StoreDeliveriesPage />
  if (role.key === 'store' && page.to === '/store/issues') return <StoreIssuesPage />
  if (role.key === 'loader' && page.end) return <LoaderHomePage />
  if (role.key === 'loader' && page.to === '/loader/issues') return <LoaderIssuesPage />
  if (role.key === 'loader' && page.to === '/loader/profile') return <LoaderProfilePage />
  if (role.key === 'driver') {
    if (page.end) return <DriverHomePage />
    if (page.to === '/driver/trip') return <DriverCurrentTripPage />
    if (page.to === '/driver/deliveries') return <DriverDeliveriesPage />
    if (page.to === '/driver/profile') return <DriverProfilePage />
  }
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
      {role.key === 'store' ? (
        <>
          <Route path="orders/:id" element={<StoreOrderDetailPage />} />
          <Route path="deliveries/:orderId" element={<ConfirmReceiptPage />} />
          <Route path="deliveries/:orderId/issue" element={<ReportIssuePage />} />
        </>
      ) : null}
      {role.key === 'loader' ? (
        <>
          <Route path="trips/:taskId" element={<LoaderTripPage />} />
          <Route path="trips/:taskId/orders/:lineId" element={<LoaderOrderPage />} />
          <Route path="trips/:taskId/orders/:lineId/shortfall" element={<LoaderShortfallPage />} />
        </>
      ) : null}
      {role.key === 'driver' ? (
        <>
          <Route path="trips/:tripIndex" element={<DriverTripPage />} />
          <Route path="trips/:tripIndex/route" element={<DriverRoutePage />} />
          <Route path="trips/:tripIndex/complete" element={<DriverTripDonePage />} />
          <Route path="trips/:tripIndex/stops/:seq" element={<DriverStopPage />} />
          <Route path="trips/:tripIndex/orders/:orderId" element={<DriverOrderPage />} />
          <Route path="trips/:tripIndex/orders/:orderId/confirm" element={<DriverRecordPage mode="confirm" />} />
          <Route path="trips/:tripIndex/orders/:orderId/issue" element={<DriverRecordPage mode="issue" />} />
          <Route path="deliveries/:orderId" element={<DriverDeliveryDetailPage />} />
          <Route path="sync" element={<SyncStatusPage />} />
        </>
      ) : null}
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
