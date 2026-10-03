import { ReceiptDiscrepanciesPanel } from '../receipt/ReceiptDiscrepanciesPanel'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, Input, LoadingState, MetricCard, PageHeader } from '../../components'
import type { Column } from '../../components'
import { api, apiReadError } from '../../lib/apiClient'
import { useDispatcherScope } from '../shell/useDispatcherScope'
import { useReferenceSummary } from '../shell/useReferenceSummary'
import { useDeferralRun, type DeferralRecord } from './deferralQueries'
import { deferReasonLabel } from './deferralReasons'
import { UnavailablePanel } from '../../components/UnavailablePanel'

type DeferralTab = 'all' | 'repeat' | 'protected'

export function DeferredOrdersPage() {
  const scope = useDispatcherScope()
  const summary = useReferenceSummary()
  const [date, setDate] = useState('')
  const [tab, setTab] = useState<DeferralTab>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const depots = useQuery({ queryKey: ['reference', 'depots'], retry: false, queryFn: async () => {
    const result = await api.GET('/api/v1/reference/depots')
    if (!result.data) throw apiReadError(result.response, 'Depots could not be loaded')
    return result.data
  } })
  const runDate = date || summary.data?.demoOperatingDate
  const depot = scope.depot || depots.data?.[0]
  const run = useDeferralRun(runDate, depot)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (run.data?.items ?? []).filter(row =>
      (tab === 'all' || (tab === 'repeat' ? row.consecutiveDeferrals > 1 : row.protectNextRun))
      && (!needle || row.orderRef.toLowerCase().includes(needle) || row.outletId.toLowerCase().includes(needle)))
  }, [run.data, tab, query])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const selected = (run.data?.items ?? []).find(row => row.id === selectedId) ?? null
  const reset = (change: () => void) => { change(); setPage(0) }

  const columns = useMemo<Column<DeferralRecord>[]>(() => [
    { key: 'order', header: 'Order', cell: row => <>
      <button type="button" className="table-link" aria-pressed={row.id === selectedId} onClick={() => setSelectedId(row.id)}>{row.orderRef}</button>
      <br /><span className="field-hint">{row.outletId} · {row.brand} · {row.tempRequirement}</span></> },
    { key: 'reason', header: 'Reason', cell: row => <>{deferReasonLabel(row.reasonCode)}<br /><span className="field-hint">{row.reason}</span></> },
    { key: 'skips', header: 'Skips in a row', cell: row => row.consecutiveDeferrals > 1
      ? <Badge tone="danger">{ordinal(row.consecutiveDeferrals)} skip</Badge> : <Badge>1st skip</Badge> },
    { key: 'next', header: 'Next run', cell: row => <>{row.nextPlanningDate}{row.protectNextRun ? <><br /><Badge tone="warning">Protected</Badge></> : null}</> },
    { key: 'store', header: 'Store notice', cell: row => !row.notifyStore ? 'Not notified'
      : row.acknowledgedAt ? `Acknowledged ${formatInstant(row.acknowledgedAt)}` : 'Awaiting acknowledgement' },
  ], [selectedId])

  return <>
    <PageHeader title="Deferred Orders" subtitle="Orders deferred when a plan was published, with the reason, next run and store acknowledgement." />
    <div className="toolbar-row toolbar-card">
      <Input label="Planning run" type="date" value={runDate ?? ''} onChange={event => reset(() => setDate(event.target.value))} />
      <Input label="Search order or outlet" type="search" value={query} onChange={event => reset(() => setQuery(event.target.value))} />
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
        : <div className="split-view">
          <div>
            <div role="group" aria-label="Filter deferred orders" className="toolbar-row">
              {([['all', `All (${run.data.deferredOrders})`], ['repeat', `Repeat skips (${run.data.repeatSkips})`], ['protected', `Protected (${run.data.protectedNextRun})`]] as const).map(([key, label]) =>
                <Button key={key} variant={tab === key ? 'primary' : 'secondary'} aria-pressed={tab === key} onClick={() => reset(() => setTab(key))}>{label}</Button>)}
            </div>
            {filtered.length === 0
              ? <EmptyState title="No matching deferrals" description="Change the filter or search to see other deferred orders." />
              : <>
                <DataTable caption="Deferred orders" columns={columns} rows={visible} rowKey={row => String(row.id)} />
                {pageCount > 1 && (
                  <nav className="pager" aria-label="Deferred orders pages">
                    <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous page</Button>
                    <span>Page {page + 1} of {pageCount} · {filtered.length} orders</span>
                    <Button variant="secondary" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>Next page</Button>
                  </nav>
                )}
              </>}
          </div>
          <DeferralRecordPanel record={selected} onClose={() => setSelectedId(null)} />
        </div>}
    </>}
  </>
}

/** The Figma "Deferral record": every value is a stored fact about the decision. */
function DeferralRecordPanel({ record, onClose }: { record: DeferralRecord | null; onClose: () => void }) {
  if (!record) return <Card><h2 className="text-heading-s">Deferral record</h2><p className="field-hint">Select an order to see who deferred it, why, and what happens next.</p></Card>
  const served = record.evidence.daysSinceLastServed
  return (
    <Card>
      <div className="card-header-row">
        <h2 className="text-heading-s">{record.orderRef}</h2>
        <Button variant="ghost" aria-label="Close deferral record" onClick={onClose}>Close</Button>
      </div>
      <dl className="detail-grid" aria-label="Deferral record">
        <div><dt>Reason</dt><dd>{deferReasonLabel(record.reasonCode)}<br />{record.reason}</dd></div>
        {record.ruleCode && <div><dt>Constraint cited</dt><dd>{record.ruleCode}</dd></div>}
        <div><dt>Recorded by</dt><dd>{record.decidedByName}<br />{formatInstant(record.decidedAt)}</dd></div>
        <div><dt>Skipped in a row</dt><dd>{record.consecutiveDeferrals} operating {record.consecutiveDeferrals === 1 ? 'day' : 'days'}</dd></div>
        <div><dt>Days since last served</dt><dd>{typeof served === 'number' ? `${served} (imported scenario data)` : 'Not recorded'}</dd></div>
        <div><dt>Store notified</dt><dd>{!record.notifyStore ? 'No' : record.acknowledgedAt ? `Yes, acknowledged ${formatInstant(record.acknowledgedAt)}` : 'Yes, awaiting acknowledgement'}</dd></div>
        <div><dt>Next run</dt><dd>{record.nextPlanningDate}{record.protectNextRun ? ', protected: first priority' : ''}</dd></div>
        <div><dt>Order status now</dt><dd>{record.currentOrderStatus ?? 'Unknown'}</dd></div>
      </dl>
    </Card>
  )
}

const PAGE_SIZE = 20

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
    <ReceiptDiscrepanciesPanel />
    <div className="split-view">
      <UnavailablePanel title="Open, in-progress and resolved issues" description="Phase 10 supplies planning exceptions and their resolution history." />
      <UnavailablePanel title="Issue detail and suggested fix" description="Validated fixes become available with the constraint and explanation services." />
    </div>
  </>
}
