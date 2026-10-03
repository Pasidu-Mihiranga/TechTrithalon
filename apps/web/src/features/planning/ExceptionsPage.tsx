import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Package, Smartphone, Store, TriangleAlert, Truck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge, Button, Card, EmptyState, ErrorState, Input, LoadingState, PageHeader } from '../../components'
import type { BadgeTone } from '../../components'
import { useDispatcherScope } from '../shell/useDispatcherScope'
import { useReferenceSummary } from '../shell/useReferenceSummary'
import {
  DECISION_LABELS, KIND_LABELS, STATUS_LABELS, ago, stamp, useClaimException, useExceptionQueue, useResolveException,
} from './exceptionQueries'
import type { ExceptionItem, ExceptionStatus } from './exceptionQueries'
import './exceptions.css'

type Tab = 'ALL' | ExceptionStatus
const TONES: Record<ExceptionStatus, BadgeTone> = { OPEN: 'danger', IN_PROGRESS: 'warning', RESOLVED: 'success' }
const ICONS: Record<string, LucideIcon> = {
  LOADING_SHORTFALL: Package, RECEIPT_DISPUTE: Store, DELIVERY_PARTIAL: Truck, DELIVERY_FAILED: Truck, DELIVERY_REVIEW: Truck,
  SYNC_CONFLICT: Smartphone, SYNC_REJECTED: Smartphone, ROUTE_CHANGED_OFFLINE: Smartphone, STOP_NOT_ON_TRIP: Smartphone,
}

/** Everything that needs the dispatcher after planning, in one queue (Figma Exceptions 76:6013). */
export function ExceptionsPage() {
  const scope = useDispatcherScope()
  const summary = useReferenceSummary()
  const [pickedDate, setPickedDate] = useState('')
  const [tab, setTab] = useState<Tab>('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const date = pickedDate || summary.data?.demoOperatingDate
  const queue = useExceptionQueue(date, scope.depot)
  const items = queue.data?.items ?? []
  const shown = tab === 'ALL' ? items : items.filter(i => i.status === tab)
  const selected = items.find(i => i.id === selectedId) ?? null
  const counts = queue.data?.counts

  return <>
    <PageHeader title="Exceptions" subtitle="Issues requiring dispatcher attention."
      actions={<Input label="Run" type="date" value={date ?? ''} onChange={event => { setPickedDate(event.target.value); setSelectedId(null) }} />} />
    {(summary.isPending || queue.isPending) && !queue.isError && <LoadingState rows={4} label="Loading exceptions" />}
    {summary.isError && <ErrorState error={summary.error} message="The delivery day could not be loaded." onRetry={() => void summary.refetch()} />}
    {queue.isError && <ErrorState error={queue.error} message="Exceptions could not be loaded." onRetry={() => void queue.refetch()} />}
    {queue.data && counts && <>
      <div role="group" aria-label="Filter exceptions" className="segmented-control ex-tabs">
        {([['ALL', `All (${counts.all})`], ['OPEN', `Open (${counts.open})`], ['IN_PROGRESS', `In Progress (${counts.inProgress})`], ['RESOLVED', `Resolved (${counts.resolved})`]] as const).map(([key, label]) =>
          <button key={key} type="button" className={`segmented-btn${tab === key ? ' active' : ''}`} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      {items.length === 0
        ? <EmptyState title="Nothing needs attention" description="Loading shortfalls, driver problems, offline review flags and store disputes for this run appear here." />
        : <div className="ex-split">
          <ul className="ex-list" aria-label="Exceptions">
            {shown.length === 0 && <li><EmptyState title="No exceptions in this view" description="Choose another tab to see the rest." /></li>}
            {shown.map(item => <ExceptionRow key={item.id} item={item} asOf={queue.data.asOf} active={item.id === selectedId} onSelect={() => setSelectedId(item.id)} />)}
          </ul>
          <ExceptionDetail item={selected} asOf={queue.data.asOf} date={date} depot={scope.depot} key={selected?.id ?? 'none'} />
        </div>}
    </>}
  </>
}

function ExceptionRow({ item, asOf, active, onSelect }: { item: ExceptionItem; asOf: string; active: boolean; onSelect: () => void }) {
  const Icon = ICONS[item.kind] ?? TriangleAlert
  const status = item.status as ExceptionStatus
  return (
    <li>
      <button type="button" className={`ex-row${active ? ' ex-row-active' : ''}`} aria-pressed={active} onClick={onSelect}>
        <span className={`ex-icon ex-icon-${status === 'RESOLVED' ? 'done' : 'alert'}`}><Icon size={18} aria-hidden="true" /></span>
        <span className="ex-body">
          <span className="ex-ref">{item.orderRef ?? KIND_LABELS[item.kind]}{item.vehicleId ? ` · ${item.vehicleId}` : ''}</span>
          <span className="ex-title">{item.title}</span>
          <span className="ex-detail">{item.detail}</span>
          <span className="ex-meta">{ago(item.reportedAt, asOf)}{item.reportedByName ? ` · ${item.reportedByName}` : ''}{item.ownerName ? ` · taken by ${item.ownerName}` : ''}</span>
        </span>
        <Badge tone={TONES[status]}>{STATUS_LABELS[status]}</Badge>
      </button>
    </li>
  )
}

function ExceptionDetail({ item, asOf, date, depot }: { item: ExceptionItem | null; asOf: string; date?: string; depot?: string }) {
  const claim = useClaimException(date, depot)
  const resolve = useResolveException(date, depot)
  const [decision, setDecision] = useState('')
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  if (!item) return <Card><h2 className="text-heading-s">Exception detail</h2><p className="field-hint">Select an exception to see the facts and what you can do.</p></Card>
  const status = item.status as ExceptionStatus
  const needsDecision = item.decisions.length > 0
  function submit() {
    setProblem(null)
    if (!item) return
    if (needsDecision && !decision) { setProblem('Choose a decision.'); return }
    if (!note.trim()) { setProblem('Write what you decided and why.'); return }
    resolve.mutate({ item, decision: needsDecision ? decision : undefined, note: note.trim() })
  }
  return (
    <Card>
      <div className="card-header-row">
        <h2 className="text-heading-s ex-detail-ref">{item.orderRef ?? KIND_LABELS[item.kind]}</h2>
        <Badge tone={TONES[status]}>{STATUS_LABELS[status]}</Badge>
      </div>
      <p className="ex-kind">{KIND_LABELS[item.kind] ?? item.kind}</p>
      <p className="ex-sub">{item.detail}</p>
      <dl className="detail-grid" aria-label="Exception facts">
        {item.vehicleId && <div><dt>Vehicle</dt><dd>{item.vehicleId}</dd></div>}
        {item.tripIndex !== null && <div><dt>Trip</dt><dd>Trip {item.tripIndex}</dd></div>}
        {item.outletId && <div><dt>Outlet</dt><dd>{item.outletId}</dd></div>}
        {item.driverName && <div><dt>Driver</dt><dd>{item.driverName}</dd></div>}
        <div><dt>Reported by</dt><dd>{item.reportedByName ?? 'System'}<br /><span className="field-hint">{stamp(item.reportedAt)} · {ago(item.reportedAt, asOf)}</span></dd></div>
        <div><dt>Responsible</dt><dd>{item.ownerName ?? 'Unassigned'}</dd></div>
      </dl>
      {status === 'RESOLVED'
        ? <div className="ex-resolution" aria-label="Resolution">
          <strong>{item.decision ? DECISION_LABELS[item.decision] ?? item.decision : 'Acknowledged'}</strong>
          {item.resolutionNote && <p className="ex-sub">“{item.resolutionNote}”</p>}
          <p className="field-hint">{item.resolvedByName}{item.resolvedAt ? `, ${stamp(item.resolvedAt)}` : ''}</p>
        </div>
        : <>
          {status === 'OPEN' && <Button variant="secondary" loading={claim.isPending} onClick={() => claim.mutate(item)}>Take it</Button>}
          {claim.isError && <p className="ex-error" role="alert">{claim.error.message}</p>}
          {needsDecision && (
            <fieldset className="ex-fieldset">
              <legend className="ex-legend">Decision</legend>
              <div className="ex-choices">
                {item.decisions.map(d => (
                  <button key={d} type="button" role="radio" aria-checked={decision === d} className={`filter-pill${decision === d ? ' active' : ''}`}
                    onClick={() => { setDecision(d); setProblem(null) }}>{DECISION_LABELS[d] ?? d}</button>
                ))}
              </div>
            </fieldset>
          )}
          <div className="ex-field">
            <label className="ex-legend" htmlFor="ex-note">{needsDecision ? 'Decision note' : 'Note'}</label>
            <textarea id="ex-note" className="ex-input" rows={2} maxLength={1000} value={note} onChange={e => { setNote(e.target.value); setProblem(null) }} />
          </div>
          {problem && <p className="ex-error" role="alert">{problem}</p>}
          {resolve.isError && <p className="ex-error" role="alert">{resolve.error.message}</p>}
          <div className="ex-actions">
            <Button loading={resolve.isPending} onClick={submit}>{needsDecision ? 'Decide' : 'Acknowledge'}</Button>
            <Link className="btn btn-secondary btn-md" to="/dispatcher/planning">Open in Planning <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </>}
    </Card>
  )
}
