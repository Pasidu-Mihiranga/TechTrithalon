import { useState } from 'react'
import {
  ArrowRight,
  Box,
  CheckCircle,
  Clock,
  Fuel,
  GitCompare,
  Lock,
  Navigation,
  RotateCcw,
  Send,
  Truck,
  UserRound,
  X,
} from 'lucide-react'
import { Badge, EmptyState } from '../../components'
import type { ManualPlanView, PlanChanges, PublishedTrip } from './manualPlanQueries'
import { ManualPlanRequestError, useLoadingIssues, useManualPlans, usePlanChanges, useResolveLoadingIssue } from './manualPlanQueries'
import type { LoadingIssue } from './manualPlanQueries'

export interface DispatchManifestRow {
  vehicle: string
  driver?: string
  stops: number
  volume: string
  departs?: string
  accentColor?: string
}

export interface DispatchMetrics {
  totalVehicles: number
  totalDrivers: number
  totalOrders: number
  totalVolumeM3: number
}

export interface PlanningStep5ConfirmProps {
  activeDepot: string
  planDate: string
  manifestRows?: DispatchManifestRow[]
  metrics?: DispatchMetrics
  onPublishPlan?: () => Promise<void>
  candidateView?: ManualPlanView | null
  onPublishCandidate?: (reason: string) => Promise<void>
  /** Starts a revision of the current published version; 'empty' skips copying its trips. */
  onRevise?: (startFrom: 'published' | 'empty') => Promise<void>
  /** Opens another version of this run (the version that replaced a superseded one). */
  onOpenPlan?: (planId: number) => void
  failure?: Error | null
  onReloadPlan?: () => void
  actionPending?: boolean
}

const CHANGE_LABELS: Record<string, string> = {
  ADDED: 'Added', REMOVED: 'Removed (deferred)', MOVED: 'Moved', RESEQUENCED: 'Stop order changed',
}

function clock(value?: string | null) {
  return value ? value.slice(0, 5) : '—'
}

function timeOf(instant?: string | null) {
  if (!instant) return '—'
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
    .format(new Date(instant))
}

function metric(value: number | null | undefined, unit: string, digits = 1) {
  return value == null ? '—' : `${Number(value).toFixed(digits)} ${unit}`
}

export function PlanningStep5Confirm({
  activeDepot,
  planDate,
  manifestRows: propsManifestRows = [],
  metrics: propsMetrics,
  onPublishPlan,
  candidateView,
  onPublishCandidate,
  onRevise,
  onOpenPlan,
  failure,
  onReloadPlan,
  actionPending = false,
}: PlanningStep5ConfirmProps) {
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [publishReason, setPublishReason] = useState('Publish the validated delivery plan to the dock and drivers')
  const [publishing, setPublishing] = useState(false)
  const [localPublishError, setLocalPublishError] = useState<string | null>(null)
  const [showToast, setShowToast] = useState(false)
  const [revising, setRevising] = useState(false)
  const [reviseError, setReviseError] = useState<ManualPlanRequestError | Error | null>(null)

  const plan = candidateView?.plan
  const changes = usePlanChanges(plan?.id ?? undefined)
  const runPlans = useManualPlans(plan?.planDate ?? '', plan?.depot)
  // The version publication would replace must still be the current one; the server enforces this too.
  const current = (runPlans.data ?? []).find(v => v.plan.status === 'published')?.plan
  const staleBase = plan?.status === 'candidate' && runPlans.isSuccess && (current?.id ?? null) !== (plan.basedOnPlanId ?? null)
  const metricsView = candidateView?.validation?.metrics

  async function handleSendPlan() {
    setPublishing(true)
    setLocalPublishError(null)
    try {
      if (candidateView && onPublishCandidate) {
        await onPublishCandidate(publishReason.trim() || 'Published operational delivery plan')
      } else if (onPublishPlan) {
        await onPublishPlan()
      } else {
        throw new Error('Publication service is unavailable. No plan has been sent.')
      }
      setConfirmModalOpen(false)
      setShowToast(true)
    } catch (err) {
      setLocalPublishError(err instanceof Error ? err.message : 'Plan could not be published.')
    } finally {
      setPublishing(false)
    }
  }

  async function handleRevise(startFrom: 'published' | 'empty') {
    if (!onRevise) return
    setRevising(true)
    setReviseError(null)
    try {
      await onRevise(startFrom)
    } catch (err) {
      setReviseError(err instanceof Error ? err : new Error('The revision could not be created.'))
    } finally {
      setRevising(false)
    }
  }

  if (plan && plan.status !== 'candidate') {
    return (
      <PublishedVersion
        view={candidateView!}
        activeDepot={activeDepot}
        planDate={planDate}
        showToast={showToast}
        onDismissToast={() => setShowToast(false)}
        onRevise={onRevise ? handleRevise : undefined}
        revising={revising}
        reviseError={reviseError}
        onOpenPlan={onOpenPlan}
      />
    )
  }

  // Candidate (5A): the manifest that publication will send, from server data only.
  const driverBySlot = new Map((changes.data?.trips ?? []).map(t => [`${t.vehicleId}:${t.tripIndex}`, t.driverAfter ?? null]))
  const manifestRows: DispatchManifestRow[] = candidateView
    ? (candidateView.trips ?? []).map((trip) => {
        const util = candidateView.utilisation?.[String(trip.id)]
        const slot = `${trip.vehicleId}:${trip.tripIndex}`
        return {
          vehicle: `${trip.vehicleId} · trip ${trip.tripIndex}`,
          driver: changes.isSuccess ? (driverBySlot.get(slot) ?? 'No driver linked') : '—',
          stops: trip.stops?.length ?? 0,
          volume: `${metric(util?.volumeUsedM3, '')}/ ${metric(util?.volumeLimitM3, 'm³')}`,
          departs: clock(trip.stops?.[0]?.plannedArrival),
        }
      })
    : propsManifestRows

  const vehiclesCount = candidateView ? (metricsView?.vehiclesUsed ?? '—') : (propsMetrics?.totalVehicles ?? '—')
  const ordersCount = candidateView ? (metricsView?.ordersAssigned ?? '—') : (propsMetrics?.totalOrders ?? '—')
  const totalVolumeStr = candidateView ? metric(metricsView?.assignedVolumeM3, 'm³') : propsMetrics ? metric(propsMetrics.totalVolumeM3, 'm³') : '—'
  const linkedDrivers = changes.data ? new Set((changes.data.trips ?? []).filter(t => t.change !== 'REMOVED' && t.driverAfter).map(t => t.driverAfter)).size : null
  const driversCount = candidateView ? (linkedDrivers ?? '—') : (propsMetrics?.totalDrivers ?? '—')
  const undecidedOrders = (candidateView?.unassignedOrders ?? []).filter(item => item.disposition !== 'DEFERRED')
  const deferredOrders = (candidateView?.unassignedOrders ?? []).filter(item => item.disposition === 'DEFERRED')
  const notifiedStores = deferredOrders.filter(item => item.notifyStore).length
  const isRevision = plan?.basedOnPlanId != null
  const baseVersion = changes.data?.baseVersion

  return (
    <div className="planning-step5-container animate-fade-in">
      {failure && (
        <div className="step5-alert step5-alert-danger" role="alert">
          <div className="step5-alert-row">
            <div>
              <strong>Publication blocked: </strong>
              <span>{failure.message}</span>
              {failure instanceof ManualPlanRequestError && failure.traceId && (
                <div className="field-hint">Trace ID: <code>{failure.traceId}</code></div>
              )}
            </div>
            {onReloadPlan && (
              <button type="button" className="toolbar-btn small" onClick={onReloadPlan}>
                <RotateCcw size={12} aria-hidden="true" />
                <span>Reload plan</span>
              </button>
            )}
          </div>
        </div>
      )}

      {staleBase && (
        <div className="step5-alert step5-alert-warning" role="alert">
          <div className="step5-alert-row">
            <span>
              <strong>Cannot be sent: </strong>
              version {current?.version} was published after this candidate was created. Open it and choose Revise to start from the current version.
            </span>
            {current?.id != null && onOpenPlan && (
              <button type="button" className="toolbar-btn small" onClick={() => onOpenPlan(current.id!)}>Open version {current.version}</button>
            )}
          </div>
        </div>
      )}

      <div className="confirm-ready-banner">
        <div className="confirm-banner-left">
          <div className="confirm-icon-box">
            <CheckCircle size={28} className="text-success" />
          </div>
          <div>
            <h2 className="confirm-banner-title">
              {staleBase
                ? `${isRevision ? `Revision ${plan?.version}` : 'This candidate'} is out of date`
                : manifestRows.length > 0
                  ? isRevision ? `Revision ${plan?.version} is ready to send` : 'Delivery plan is ready to send'
                  : 'Confirm & Send'}
            </h2>
            <p className="confirm-banner-subtitle">
              {manifestRows.length > 0
                ? isRevision
                  ? `Publishing replaces version ${baseVersion ?? '…'} for ${planDate} at ${activeDepot}. The dock and drivers switch to this version.`
                  : `Review the manifest for ${planDate} from ${activeDepot} before sending it to the dock.`
                : 'Assign orders to trips in Review Allocation to build the manifest.'}
            </p>
          </div>
        </div>
        <div className="step5-banner-actions">
          <button
            type="button"
            className="btn-primary-yellow large"
            disabled={actionPending || manifestRows.length === 0 || staleBase}
            onClick={() => setConfirmModalOpen(true)}
          >
            <Send size={16} aria-hidden="true" />
            <span>Confirm & Send Plan</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="kpi-grid-5">
        <Kpi icon={<Truck size={15} />} tone="orange" label="Vehicles" value={vehiclesCount} sub="routes allocated" />
        <Kpi icon={<UserRound size={15} />} tone="yellow" label="Drivers" value={driversCount} sub="linked to these vehicles" />
        <Kpi icon={<Box size={15} />} tone="amber" label="Total orders" value={ordersCount} sub="scheduled stops" />
        <Kpi icon={<Navigation size={15} />} tone="green" label="Total volume" value={totalVolumeStr} sub="payload allocated" />
        <Kpi icon={<Fuel size={15} />} tone="blue" label="Fuel & distance"
          value={metric(metricsView?.totalFuelLitres, 'L', 2)} sub={metric(metricsView?.totalDistanceKm, 'km', 2)} />
      </div>

      {isRevision && <ChangeSummary changes={changes.data} loading={changes.isPending} failed={changes.isError} />}

      <div className="confirm-main-grid">
        <div>
          <div className="manifests-card">
            <div className="manifests-head">
              <span className="manifests-title">Vehicle manifest</span>
              <span className="manifests-count-badge">
                {manifestRows.length > 0 ? `${manifestRows.length} trips · one load task each` : 'No trips yet'}
              </span>
            </div>
            <div className="manifests-table-container">
              <table className="manifests-table">
                <caption className="visually-hidden">Trips that publication sends to the dock</caption>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Driver</th>
                    <th>Stops</th>
                    <th>Volume</th>
                    <th>First arrival</th>
                  </tr>
                </thead>
                <tbody>
                  {manifestRows.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState title="No manifest yet" description="Assign orders to trips in Review Allocation to build the manifest." />
                      </td>
                    </tr>
                  ) : manifestRows.map((row, idx) => (
                    <tr key={`${row.vehicle}-${idx}`}>
                      <td><strong>{row.vehicle}</strong></td>
                      <td>{row.driver ?? '—'}</td>
                      <td>{row.stops}</td>
                      <td>{row.volume}</td>
                      <td>{row.departs ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div className="notify-card">
            <h3 className="notify-title">What sending does</h3>
            <ul className="step5-effects">
              {isRevision && <li>Replaces version {baseVersion ?? '…'}; its load tasks are withdrawn from the dock.</li>}
              <li>Creates one load task per trip for the {activeDepot} dock, loaded last stop first.</li>
              <li>Assigns each trip to the driver linked to its vehicle.</li>
              <li>Reserves the trips&apos; fuel against each vehicle&apos;s weekly quota{isRevision ? ', replacing the earlier reservation' : ''}.</li>
              <li>
                {deferredOrders.length > 0
                  ? `Moves ${deferredOrders.length} deferred ${deferredOrders.length === 1 ? 'order' : 'orders'} to the next run and notifies ${notifiedStores} ${notifiedStores === 1 ? 'store' : 'stores'}.`
                  : 'No orders are deferred.'}
              </li>
            </ul>
            <div className="notify-desc step5-note">
              <Clock size={12} aria-hidden="true" />
              <span>SMS and email delivery are not available. The dock and drivers see their work when they sign in.</span>
            </div>
          </div>
        </div>
      </div>

      {confirmModalOpen && (
        <div className="modal-overlay" onClick={() => !publishing && setConfirmModalOpen(false)}>
          <div className="modal-dialog-card animate-scale-up" role="dialog" aria-modal="true" aria-labelledby="send-plan-title"
            onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3 className="modal-title" id="send-plan-title">{isRevision ? `Send revision ${plan?.version}` : 'Confirm and send plan'}</h3>
                <p className="modal-subtitle">{planDate} · {activeDepot}</p>
              </div>
              <button type="button" className="modal-close-btn" disabled={publishing} onClick={() => setConfirmModalOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="confirm-summary-box">
                <div className="summary-item"><span className="summary-num">{vehiclesCount}</span><span className="summary-lbl">Vehicles</span></div>
                <div className="summary-item"><span className="summary-num">{ordersCount}</span><span className="summary-lbl">Orders</span></div>
                <div className="summary-item"><span className="summary-num">{totalVolumeStr}</span><span className="summary-lbl">Volume</span></div>
              </div>

              {candidateView && (
                <div className="modal-form-group">
                  <label className="field-label" htmlFor="publish-reason">Reason (required)</label>
                  <input
                    id="publish-reason"
                    type="text"
                    className="field-input full-width"
                    value={publishReason}
                    maxLength={500}
                    onChange={(e) => setPublishReason(e.target.value)}
                    required
                  />
                </div>
              )}

              {undecidedOrders.length > 0 && (
                <div className="step5-alert step5-alert-danger" role="alert">
                  <strong>Not ready: </strong>
                  <span>{undecidedOrders.map(item => item.order?.orderRef).join(', ')} must be assigned or deferred with a reason before publication.</span>
                </div>
              )}

              <p className="confirm-warning-text">
                Sending locks this version. To change it later, create a revision; the dock and drivers then switch to the new version.
              </p>

              {localPublishError && (
                <div className="step5-alert step5-alert-danger" role="alert">
                  <strong>Publication failed: </strong>
                  <span>{localPublishError}</span>
                </div>
              )}
            </div>

            <div className="modal-actions-footer">
              <button type="button" className="toolbar-btn" disabled={publishing} onClick={() => setConfirmModalOpen(false)}>Cancel</button>
              <button
                type="button"
                className="btn-primary-yellow"
                disabled={publishing || (candidateView != null && (!publishReason.trim() || undecidedOrders.length > 0))}
                onClick={() => void handleSendPlan()}
              >
                <Send size={15} aria-hidden="true" />
                <span>{publishing ? 'Sending…' : 'Yes, send delivery plan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ icon, tone, label, value, sub }: { icon: React.ReactNode; tone: string; label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="kpi-tile">
      <div className="kpi-tile-header">
        <span className={`kpi-icon-box ${tone}`}>{icon}</span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}

/** Server-computed difference between a revision and the version it replaces. */
function ChangeSummary({ changes, loading, failed }: { changes?: PlanChanges; loading: boolean; failed: boolean }) {
  if (loading) return <div className="manifests-card" aria-busy="true"><p className="field-hint">Comparing with the published version…</p></div>
  if (failed || !changes) return <div className="step5-alert step5-alert-danger" role="alert">The changes against the published version could not be loaded.</div>
  const s = { added: 0, removed: 0, moved: 0, resequenced: 0, unchanged: 0, tripsAdded: 0, tripsRemoved: 0, driversChanged: 0, ...changes.summary }
  const changed = (changes.orders ?? []).filter(o => o.change !== 'UNCHANGED')
  return (
    <section className="manifests-card" aria-label="Changes from the published version">
      <div className="manifests-head">
        <span className="manifests-title"><GitCompare size={14} aria-hidden="true" /> Changes from version {changes.baseVersion}</span>
        <span className="manifests-count-badge">{s.unchanged} orders unchanged</span>
      </div>
      <div className="step5-change-chips">
        <Badge tone={s.added > 0 ? 'brand' : 'neutral'}>{s.added} added</Badge>
        <Badge tone={s.removed > 0 ? 'danger' : 'neutral'}>{s.removed} removed</Badge>
        <Badge tone={s.moved > 0 ? 'warning' : 'neutral'}>{s.moved} moved</Badge>
        <Badge tone={s.resequenced > 0 ? 'warning' : 'neutral'}>{s.resequenced} re-sequenced</Badge>
        <Badge tone="neutral">{s.tripsAdded} trips added · {s.tripsRemoved} removed</Badge>
        <Badge tone={s.driversChanged > 0 ? 'warning' : 'neutral'}>{s.driversChanged} driver changes</Badge>
      </div>
      {changed.length === 0 ? (
        <p className="field-hint">No order changes trips or position. Publishing still replaces the version the dock holds.</p>
      ) : (
        <div className="manifests-table-container">
          <table className="manifests-table">
            <caption className="visually-hidden">Orders that change</caption>
            <thead><tr><th>Order</th><th>Change</th><th>Before</th><th>After</th></tr></thead>
            <tbody>
              {changed.map(o => (
                <tr key={o.orderId}>
                  <td><strong>{o.orderRef ?? `#${o.orderId}`}</strong><br /><span className="field-hint">{o.outletId}</span></td>
                  <td>{CHANGE_LABELS[o.change ?? ''] ?? o.change}</td>
                  <td>{o.before ? `${o.before.vehicleId} · trip ${o.before.tripIndex} · stop ${o.before.seq}` : '—'}</td>
                  <td>{o.after ? `${o.after.vehicleId} · trip ${o.after.tripIndex} · stop ${o.after.seq}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** 5B: a published or superseded version, read from the values frozen at publication. */
function PublishedVersion({ view, activeDepot, planDate, showToast, onDismissToast, onRevise, revising, reviseError, onOpenPlan }: {
  view: ManualPlanView
  activeDepot: string
  planDate: string
  showToast: boolean
  onDismissToast: () => void
  onRevise?: (startFrom: 'published' | 'empty') => void
  revising: boolean
  reviseError: Error | null
  onOpenPlan?: (planId: number) => void
}) {
  const plan = view.plan
  const trips: PublishedTrip[] = view.published ?? []
  const superseded = plan.status === 'superseded'
  const metrics = view.validation?.metrics
  const withDriver = trips.filter(t => t.driverName)
  const driverNames = [...new Set(withDriver.map(t => t.driverName))]
  const pending = trips.filter(t => t.loadStatus === 'pending').length
  const loaded = trips.filter(t => t.loadStatus === 'loaded').length
  const inProgress = trips.filter(t => t.loadStatus === 'loading').length
  const held = trips.filter(t => t.held).length
  const first = [...trips].sort((a, b) => (a.plannedDepart ?? '').localeCompare(b.plannedDepart ?? ''))[0]
  const copyInfeasible = reviseError instanceof ManualPlanRequestError && reviseError.code === 'REVISION_COPY_INFEASIBLE'

  return (
    <div className="planning-step5-container animate-fade-in">
      {showToast && (
        <div className="top-floating-toast" role="status">
          <div className="toast-left">
            <CheckCircle size={16} className="text-success" />
            <span>Version {plan.version} sent to the {activeDepot} dock: {trips.length} load {trips.length === 1 ? 'task' : 'tasks'} created.</span>
          </div>
          <div className="toast-right">
            <button type="button" className="toast-close-btn" onClick={onDismissToast} aria-label="Dismiss"><X size={14} /></button>
          </div>
        </div>
      )}

      {superseded && (
        <div className="step5-alert step5-alert-warning" role="status">
          <div className="step5-alert-row">
            <span>
              <strong>Replaced: </strong>
              version {plan.version} was replaced {timeOf(plan.supersededAt)}. Its load tasks were withdrawn from the dock.
            </span>
            {plan.supersededByPlanId != null && onOpenPlan && (
              <button type="button" className="toolbar-btn small" onClick={() => onOpenPlan(plan.supersededByPlanId!)}>
                Open the current version
              </button>
            )}
          </div>
        </div>
      )}

      <div className="step5-sent-grid">
        <div className="sent-timeline-card">
          <div className="sent-head-row">
            <div className="sent-big-icon-box">
              <CheckCircle size={24} aria-hidden="true" />
            </div>
            <div>
              <h2 className="sent-main-title">{superseded ? `Version ${plan.version} (replaced)` : `Version ${plan.version} sent to the dock`}</h2>
              <p className="sent-main-subtitle">
                Published {timeOf(plan.publishedAt)} for {planDate} · {activeDepot}
                {plan.basedOnPlanId != null ? ' · replaced the previous version' : ''} · rules {plan.ruleVersion ?? '—'}
              </p>
            </div>
          </div>

          <ol className="sent-timeline-body" aria-label="Publication progress">
            <Milestone done time={clock(plan.publishedAt ? new Date(plan.publishedAt).toLocaleTimeString('en-GB', { timeZone: 'Asia/Colombo' }) : null)}
              title="Plan locked and sent"
              sub={`${trips.length} load ${trips.length === 1 ? 'task' : 'tasks'} · ${metrics?.ordersAssigned ?? '—'} orders · ${metric(metrics?.assignedVolumeM3, 'm³')}`} />
            <Milestone done={withDriver.length === trips.length && trips.length > 0}
              title={`Drivers assigned to ${withDriver.length} of ${trips.length} trips`}
              sub={driverNames.length > 0 ? driverNames.join(', ') : 'No driver account is linked to these vehicles'} />
            <Milestone done={!superseded && trips.length > 0 && loaded === trips.length}
              title={superseded ? 'Load tasks withdrawn' : pending === trips.length ? 'Waiting for the loader' : `${loaded} of ${trips.length} trips loaded`}
              sub={superseded ? 'The dock works from the version that replaced this one'
                : [`${inProgress} in progress`, `${pending} not started`, held > 0 ? `${held} held by a shortfall` : null].filter(Boolean).join(' · ')} />
            {first && (
              <Milestone time={clock(first.plannedDepart)} title="First vehicle departs"
                sub={`${first.vehicleId} · ${first.driverName ?? 'no driver linked'} · ${first.district}`} />
            )}
          </ol>

          {!superseded && onRevise && (
            <div className="sent-timeline-actions">
              <button type="button" className="toolbar-btn" disabled={revising} onClick={() => onRevise('published')}>
                <RotateCcw size={14} aria-hidden="true" />
                <span>{revising ? 'Creating revision…' : 'Revise this plan'}</span>
              </button>
              {copyInfeasible && (
                <button type="button" className="toolbar-btn" disabled={revising} onClick={() => onRevise('empty')}>
                  <span>Start an empty revision</span>
                </button>
              )}
            </div>
          )}
          {reviseError && (
            <div className="step5-alert step5-alert-danger" role="alert">
              <strong>Revision not created: </strong>
              <span>{reviseError.message}</span>
              {copyInfeasible && (reviseError as ManualPlanRequestError).violations.length > 0 && (
                <ul>{(reviseError as ManualPlanRequestError).violations.map((v, i) => <li key={i}>{v.message}</li>)}</ul>
              )}
            </div>
          )}
        </div>

        <aside className="sent-glance-card" aria-label="Run at a glance">
          <div className="glance-head">
            <span className="glance-title">Run at a glance</span>
            <span className="badge-locked"><Lock size={11} aria-hidden="true" /> {superseded ? 'Replaced' : 'Locked'}</span>
          </div>
          <div className="glance-stats-list">
            <Stat label="Vehicles" value={metrics?.vehiclesUsed ?? '—'} />
            <Stat label="Trips" value={trips.length} />
            <Stat label="Orders" value={metrics?.ordersAssigned ?? '—'} />
            <Stat label="Volume" value={metric(metrics?.assignedVolumeM3, 'm³')} />
            <Stat label="Distance" value={metric(metrics?.totalDistanceKm, 'km', 2)} />
            <Stat label="Fuel reserved" value={metric(trips.reduce((sum, t) => sum + Number(t.fuelLitres ?? 0), 0), 'L', 2)} />
          </div>
        </aside>
      </div>

      {!superseded && <LoadingIssuesPanel planDate={plan.planDate ?? ''} depot={plan.depot ?? ''} />}

      <div className="manifests-card">
        <div className="manifests-head">
          <span className="manifests-title">Published manifest</span>
          <span className="manifests-count-badge">As frozen at publication</span>
        </div>
        <div className="manifests-table-container">
          <table className="manifests-table">
            <caption className="visually-hidden">Published trips</caption>
            <thead>
              <tr><th>Vehicle</th><th>Driver</th><th>Stops</th><th>Departs</th><th>Trip time</th><th>Fuel</th><th>Load task</th></tr>
            </thead>
            <tbody>
              {trips.length === 0 ? (
                <tr><td colSpan={7}><EmptyState title="No published trips" description="This version has no trips." /></td></tr>
              ) : trips.map(t => (
                <tr key={t.tripId}>
                  <td><strong>{t.vehicleId} · trip {t.tripIndex}</strong><br /><span className="field-hint">{t.brand} · {t.district}</span></td>
                  <td>{t.driverName ?? 'No driver linked'}</td>
                  <td>{t.stops?.length ?? 0}</td>
                  <td>{clock(t.plannedDepart)}</td>
                  <td>{t.tripMinutes} min</td>
                  <td>{metric(t.fuelLitres, 'L', 2)}</td>
                  <td>
                    <Badge tone={t.loadStatus === 'loaded' ? 'success' : t.loadStatus === 'superseded' ? 'neutral' : 'warning'}>{t.loadStatus ?? '—'}</Badge>
                    {t.held ? <> <Badge tone="danger">held</Badge></> : (t.openLoadingIssues ?? 0) > 0 ? <> <Badge tone="danger">{t.openLoadingIssues} issue</Badge></> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Milestone({ done = false, time, title, sub }: { done?: boolean; time?: string; title: string; sub: string }) {
  return (
    <li className={`milestone-row${done ? ' done' : ''}`}>
      <span className="milestone-time">{time ?? ''}</span>
      <span className={`milestone-node${done ? '' : ' empty'}`} aria-hidden="true">{done ? '✓' : ''}</span>
      <div className="milestone-content">
        <div className="milestone-title-row"><span className="milestone-title">{title}</span></div>
        <div className="milestone-sub">{sub}</div>
      </div>
    </li>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="glance-stat-row">
      <span className="glance-stat-lbl">{label}</span>
      <span className="glance-stat-val">{value}</span>
    </div>
  )
}

const SHORT_KINDS: Record<string, string> = { MISSING: 'missing', DAMAGED: 'damaged', WRONG_ITEM: 'wrong item' }

/** Shortfalls the dock reported before departure, with the dispatcher's decision (releases a hold). */
function LoadingIssuesPanel({ planDate, depot }: { planDate: string; depot: string }) {
  const issues = useLoadingIssues(planDate, depot)
  const resolve = useResolveLoadingIssue()
  const [notes, setNotes] = useState<Record<number, string>>({})
  if (issues.isPending) return null
  if (issues.isError) return <div className="step5-alert step5-alert-danger" role="alert">Loading issues could not be loaded.</div>
  const list: LoadingIssue[] = issues.data ?? []
  if (list.length === 0) return null
  const open = list.filter(i => i.status === 'OPEN')
  return (
    <section className="manifests-card" aria-label="Loading issues">
      <div className="manifests-head">
        <span className="manifests-title">Loading issues</span>
        <span className="manifests-count-badge">{open.length} open · {list.length - open.length} decided</span>
      </div>
      <div className="manifests-table-container">
        <table className="manifests-table">
          <caption className="visually-hidden">Shortfalls reported by the dock</caption>
          <thead><tr><th>Order</th><th>Shortfall</th><th>Reported</th><th>Decision</th></tr></thead>
          <tbody>
            {list.map(issue => (
              <tr key={issue.id}>
                <td><strong>{issue.orderRef}</strong><br /><span className="field-hint">{issue.vehicleId} · trip {issue.tripIndex} · {issue.outletId}</span></td>
                <td>{issue.shortUnits} of {issue.orderedUnits} units {SHORT_KINDS[issue.kind ?? ''] ?? issue.kind}
                  {issue.holdsVehicle ? <> <Badge tone="danger">vehicle held</Badge></> : null}
                  {issue.note ? <><br /><span className="field-hint">“{issue.note}”</span></> : null}</td>
                <td>{issue.reportedByName}<br /><span className="field-hint">{timeOf(issue.reportedAt)}</span></td>
                <td>
                  {issue.status === 'RESOLVED' ? (
                    <><Badge tone="success">{issue.decision === 'SEND_SHORT' ? 'Send short' : 'Replanned'}</Badge><br />
                      <span className="field-hint">{issue.resolvedByName} · {issue.decisionNote}</span></>
                  ) : (
                    <div className="step5-decision">
                      <label className="visually-hidden" htmlFor={`decision-note-${issue.id}`}>Decision note for {issue.orderRef}</label>
                      <input id={`decision-note-${issue.id}`} className="field-input" placeholder="Decision note (required)" maxLength={500}
                        value={notes[issue.id!] ?? ''} onChange={e => setNotes({ ...notes, [issue.id!]: e.target.value })} />
                      <div className="step5-banner-actions">
                        <button type="button" className="toolbar-btn small" disabled={resolve.isPending || !(notes[issue.id!] ?? '').trim()}
                          onClick={() => resolve.mutate({ id: issue.id!, body: { expectedVersion: issue.version ?? 0, decision: 'SEND_SHORT', note: notes[issue.id!]!.trim() } })}>
                          Send {issue.orderedUnits! - issue.shortUnits!} units
                        </button>
                        <button type="button" className="toolbar-btn small" disabled={resolve.isPending || !(notes[issue.id!] ?? '').trim()}
                          onClick={() => resolve.mutate({ id: issue.id!, body: { expectedVersion: issue.version ?? 0, decision: 'REPLANNED', note: notes[issue.id!]!.trim() } })}>
                          Handled by a revision
                        </button>
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {resolve.error && <div className="step5-alert step5-alert-danger" role="alert">{resolve.error.message}</div>}
    </section>
  )
}
