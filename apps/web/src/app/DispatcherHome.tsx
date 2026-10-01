import { Card, ErrorState, LoadingState, MetricCard, PageHeader } from '../components'
import { useSystemHealth } from '../features/shell/useSystemHealth'
import { useReferenceSummary } from '../features/shell/useReferenceSummary'

/** Phase 1 home: only figures the API can already supply. Planning KPIs arrive with Phase 3A. */
export function DispatcherHome() {
  const summary = useReferenceSummary()
  const health = useSystemHealth()
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Reference data loaded into the system." />
      {summary.isPending && <LoadingState rows={2} label="Loading reference data" />}
      {summary.isError && <ErrorState message="Reference data could not be loaded." onRetry={() => void summary.refetch()} />}
      {summary.data && (
        <section aria-label="Reference data" className="grid-metrics">
          <MetricCard label="Outlets" value={summary.data.outlets} />
          <MetricCard label="Vehicles" value={summary.data.vehicles} />
          <MetricCard label="Districts" value={summary.data.districts} />
          <MetricCard label="Calendar days" value={summary.data.calendarDays} caption={`Demo day ${summary.data.demoOperatingDate}`} />
        </section>
      )}
      <Card>
        <h2 className="text-heading-s">Services</h2>
        {health.data ? <p className="text-body-m">API: {health.data.status} · Planning service: {health.data.intelligence}</p> : <p className="text-body-m">Checking…</p>}
      </Card>
    </>
  )
}
