import { Link } from 'react-router-dom'
import { Badge, Card, EmptyState, ErrorState, LoadingState, MetricCard, PageHeader } from '../components'
import { useDispatcherDashboard } from '../features/ordering/orderQueries'
import { useSystemHealth } from '../features/shell/useSystemHealth'
import { useDispatcherScope } from '../features/shell/useDispatcherScope'

function metricValue(metric: { available?: boolean; value?: number | null; availableFromPhase?: string | null }) {
  if (!metric.available) return '—'
  return metric.value ?? '—'
}

function metricCaption(metric: { available?: boolean; availableFromPhase?: string | null }) {
  if (!metric.available && metric.availableFromPhase) return `Available in ${metric.availableFromPhase}`
  return undefined
}

/** Phase 3A dashboard: live confirmed-order count; later KPIs stay honestly unavailable. */
export function DispatcherHome() {
  const scope = useDispatcherScope()
  const dashboard = useDispatcherDashboard(undefined, scope.depot)
  const health = useSystemHealth()

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={dashboard.data
          ? `${dashboard.data.depot} · ${dashboard.data.date}`
          : 'Planning status for the demo delivery day.'}
        actions={<Link className="btn btn-secondary btn-md" to="/dispatcher/manual-planning">Manual planning</Link>}
      />
      {dashboard.isPending && <LoadingState rows={2} label="Loading dashboard" />}
      {dashboard.isError && <ErrorState error={dashboard.error} message="Dashboard data could not be loaded." onRetry={() => void dashboard.refetch()} />}
      {dashboard.data && (
        <>
          <section aria-label="Planning metrics" className="grid-metrics">
            <MetricCard label="Orders to plan" value={metricValue(dashboard.data.ordersToPlan ?? {})} />
            <MetricCard label="Orders planned" value={metricValue(dashboard.data.ordersPlanned ?? {})} caption={metricCaption(dashboard.data.ordersPlanned ?? {})} />
            <MetricCard label="Trips ready" value={metricValue(dashboard.data.tripsReady ?? {})} caption={metricCaption(dashboard.data.tripsReady ?? {})} />
            <MetricCard label="Active trips" value={metricValue(dashboard.data.activeTrips ?? {})} caption={metricCaption(dashboard.data.activeTrips ?? {})} />
            <MetricCard label="Exceptions" value={metricValue(dashboard.data.exceptions ?? {})} caption={metricCaption(dashboard.data.exceptions ?? {})} />
          </section>

          <div className="dashboard-split">
            <Card>
              <h2 className="text-heading-s">Orders requiring attention</h2>
              {(dashboard.data.orderAttention?.length ?? 0) === 0 ? (
                <EmptyState
                  title="No attention items yet"
                  description="Exception and deferral attention lists arrive in Phases 8 and 10. Confirmed orders are available under Orders."
                />
              ) : (
                <ul className="attention-list">
                  {dashboard.data.orderAttention?.map((item) => (
                    <li key={item.id}><span className="text-brand">{item.id}</span> {item.label} <Badge tone="warning">{item.reason}</Badge></li>
                  ))}
                </ul>
              )}
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
        {health.data
          ? <p className="text-body-m">API: {health.data.status} · Planning service: {health.data.intelligence}</p>
          : <p className="text-body-m">Checking…</p>}
      </Card>
    </>
  )
}
