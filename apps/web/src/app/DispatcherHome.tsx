import { Link } from 'react-router-dom'
import { Badge, Card, EmptyState, ErrorState, LoadingState, MetricCard, PageHeader } from '../components'
import { useDispatcherDashboard } from '../features/ordering/orderQueries'
import { useSystemHealth } from '../features/shell/useSystemHealth'
import { useDispatcherScope } from '../features/shell/useDispatcherScope'
import { useExceptionQueue } from '../features/planning/exceptionQueries'
import { useDeferralRun } from '../features/planning/deferralQueries'

function metricValue(metric: { available?: boolean; value?: number | null; availableFromPhase?: string | null }) {
  if (!metric.available) return '—'
  return metric.value ?? '—'
}

function metricCaption(metric: { available?: boolean; availableFromPhase?: string | null }) {
  if (!metric.available && metric.availableFromPhase) return `Available in ${metric.availableFromPhase}`
  return undefined
}

export function DispatcherHome() {
  const scope = useDispatcherScope()
  const dashboard = useDispatcherDashboard(undefined, scope.depot)
  const health = useSystemHealth()
  const runDate = dashboard.data?.date
  const exceptions = useExceptionQueue(runDate, scope.depot)
  const deferrals = useDeferralRun(runDate, scope.depot)
  const openExceptions = (exceptions.data?.counts.open ?? 0) + (exceptions.data?.counts.inProgress ?? 0)
  const deferredOrders = deferrals.data?.deferredOrders ?? 0

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={dashboard.data
          ? `${dashboard.data.depot} · ${dashboard.data.date}`
          : 'Loading planning status…'}
        actions={<Link className="btn btn-secondary btn-md" to="/dispatcher/manual-planning">Manual planning</Link>}
      />
      {dashboard.isPending && <LoadingState rows={2} label="Loading dashboard" />}
      {dashboard.isError && <ErrorState error={dashboard.error} message="Dashboard data could not be loaded." onRetry={() => void dashboard.refetch()} />}
      {dashboard.data && (
        <>
          <section aria-label="Planning metrics" className="grid-metrics">
            <MetricCard label="Orders to plan" value={metricValue(dashboard.data.ordersToPlan ?? {})} />
            <MetricCard label="Orders planned" value={metricValue(dashboard.data.ordersPlanned ?? {})} caption={metricCaption(dashboard.data.ordersPlanned ?? {})} />
            <MetricCard label="Trips awaiting departure" value={metricValue(dashboard.data.tripsReady ?? {})}
              caption={dashboard.data.tripsReady?.available ? 'Loading or ready' : metricCaption(dashboard.data.tripsReady ?? {})} />
            <MetricCard label="Active trips" value={metricValue(dashboard.data.activeTrips ?? {})} caption={metricCaption(dashboard.data.activeTrips ?? {})} />
            <MetricCard label="Exceptions" value={metricValue(dashboard.data.exceptions ?? {})} caption={metricCaption(dashboard.data.exceptions ?? {})} />
          </section>

          <div className="dashboard-split">
            <Card>
              <h2 className="text-heading-s">Orders requiring attention</h2>
              {(exceptions.isPending || deferrals.isPending) && <LoadingState label="Loading attention items" />}
              {exceptions.isError && <ErrorState error={exceptions.error} message="Exceptions could not be loaded." onRetry={() => void exceptions.refetch()} />}
              {deferrals.isError && <ErrorState error={deferrals.error} message="Deferrals could not be loaded." onRetry={() => void deferrals.refetch()} />}
              {exceptions.data && deferrals.data && openExceptions === 0 && deferredOrders === 0 ? (
                <EmptyState
                  title="No attention items for this run"
                  description="Confirmed orders are available under Orders."
                />
              ) : null}
              {exceptions.data && deferrals.data && (openExceptions > 0 || deferredOrders > 0) &&
                <ul className="attention-list">
                  {openExceptions > 0 && <li><Link to="/dispatcher/exceptions">{openExceptions} unresolved {openExceptions === 1 ? 'exception' : 'exceptions'}</Link> <Badge tone="warning">Review</Badge></li>}
                  {deferredOrders > 0 && <li><Link to="/dispatcher/deferred-orders">{deferredOrders} deferred {deferredOrders === 1 ? 'order' : 'orders'}</Link> <Badge tone="warning">Review</Badge></li>}
                </ul>}
            </Card>
            <Card>
              <h2 className="text-heading-s">Today&apos;s planning status</h2>
              {dashboard.data.planningProgress?.available ? (
                <p className="text-body-m">{dashboard.data.planningProgress.planned} of {dashboard.data.planningProgress.total} planned</p>
              ) : (
                <EmptyState
                  title="Planning not started"
                  description={`Progress is available in ${dashboard.data.planningProgress?.availableFromPhase ?? 'Phase 7'}.`}
                />
              )}
              <Link className="btn btn-primary btn-md" to="/dispatcher/planning">Go to Planning</Link>
            </Card>
          </div>
        </>
      )}
      <Card>
        <h2 className="text-heading-s">Services</h2>
        {health.isError ? <ErrorState error={health.error} message="Service status could not be loaded." onRetry={() => void health.refetch()} /> : health.data
          ? <p className="text-body-m">API: {health.data.status} · Planning service: {health.data.intelligence}</p>
          : <p className="text-body-m">Checking…</p>}
      </Card>
    </>
  )
}
