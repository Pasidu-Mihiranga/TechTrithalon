import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, DataTable, EmptyState, ErrorState, Input, LoadingState, MetricCard, PageHeader } from '../../components'
import type { Column } from '../../components'
import { api, apiReadError } from '../../lib/apiClient'
import { useDispatcherScope } from '../shell/useDispatcherScope'
import { useReferenceSummary } from '../shell/useReferenceSummary'
import { useDeferralRun, type DeferralRecord } from './deferralQueries'
import { deferReasonLabel } from './deferralReasons'
import { UnavailablePanel } from '../../components/UnavailablePanel'

export function DeferredOrdersPage() {
  const scope = useDispatcherScope()
  const summary = useReferenceSummary()
  const [date, setDate] = useState('')
  const depots = useQuery({ queryKey: ['reference', 'depots'], retry: false, queryFn: async () => {
    const result = await api.GET('/api/v1/reference/depots')
    if (!result.data) throw apiReadError(result.response, 'Depots could not be loaded')
    return result.data
  } })
  const runDate = date || summary.data?.demoOperatingDate
  const depot = scope.depot || depots.data?.[0]
  const run = useDeferralRun(runDate, depot)
  const columns = useMemo<Column<DeferralRecord>[]>(() => [
    { key: 'order', header: 'Order', cell: row => <>{row.orderRef}<br /><span className="field-hint">{row.outletId} · {row.brand} · {row.tempRequirement}</span></> },
    { key: 'reason', header: 'Reason', cell: row => <>{deferReasonLabel(row.reasonCode)}<br /><span className="field-hint">{row.reason}</span></> },
    { key: 'skips', header: 'Skips in a row', cell: row => row.consecutiveDeferrals > 1
      ? <Badge tone="danger">{ordinal(row.consecutiveDeferrals)} skip</Badge> : <Badge>1st skip</Badge> },
    { key: 'next', header: 'Next run', cell: row => <>{row.nextPlanningDate}{row.protectNextRun ? <><br /><Badge tone="warning">Protected</Badge></> : null}</> },
    { key: 'store', header: 'Store notice', cell: row => !row.notifyStore ? 'Not notified'
      : row.acknowledgedAt ? `Acknowledged ${formatInstant(row.acknowledgedAt)}` : 'Awaiting acknowledgement' },
    { key: 'status', header: 'Order status', cell: row => row.currentOrderStatus ?? 'Unknown' },
    { key: 'decided', header: 'Recorded as', cell: row => <>{row.decidedByName}<br /><span className="field-hint">{formatInstant(row.decidedAt)}</span></> },
  ], [])

  return <>
    <PageHeader title="Deferred Orders" subtitle="Orders deferred when a plan was published, with the reason, next run and store acknowledgement." />
    <div className="toolbar-row toolbar-card">
      <Input label="Planning run" type="date" value={runDate ?? ''} onChange={event => setDate(event.target.value)} />
    </div>
    {(summary.isPending || depots.isPending || run.isPending) && <LoadingState rows={4} label="Loading deferred orders" />}
    {depots.isError && <ErrorState error={depots.error} message="Depots could not be loaded." onRetry={() => void depots.refetch()} />}
    {run.isError && <ErrorState error={run.error} message="Deferred orders could not be loaded." onRetry={() => void run.refetch()} />}
    {run.data && <>
      <section className="grid-metrics" aria-label="Deferral summary">
        <MetricCard label="Deferred orders" value={run.data.deferredOrders} caption={`${run.data.depot} · ${run.data.planDate}`} />
        <MetricCard label="Protected next run" value={run.data.protectedNextRun} caption="First priority when replanned" />
        <MetricCard label="Repeat skips" value={run.data.repeatSkips} caption="Outlet skipped on consecutive operating days" />
        <MetricCard label="Store acknowledgements" value={`${run.data.storesAcknowledged} / ${run.data.storesNotified}`} caption="Notified stores that confirmed" />
      </section>
      {run.data.items.length === 0
        ? <EmptyState title="No deferrals for this run" description="No published plan deferred an order on this date and depot." />
        : <DataTable caption="Deferred orders" columns={columns} rows={run.data.items} rowKey={row => String(row.id)} />}
    </>}
  </>
}

function ordinal(value: number) {
  const suffix = value % 10 === 2 && value % 100 !== 12 ? 'nd' : value % 10 === 3 && value % 100 !== 13 ? 'rd' : value % 10 === 1 && value % 100 !== 11 ? 'st' : 'th'
  return `${value}${suffix}`
}

function formatInstant(value: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo' }).format(new Date(value))
}

export function ExceptionsPage() {
  return <>
    <PageHeader title="Exceptions" subtitle="Issues requiring dispatcher attention." />
    <div className="split-view">
      <UnavailablePanel title="Open, in-progress and resolved issues" description="Phase 10 supplies planning exceptions and their resolution history." />
      <UnavailablePanel title="Issue detail and suggested fix" description="Validated fixes become available with the constraint and explanation services." />
    </div>
  </>
}
