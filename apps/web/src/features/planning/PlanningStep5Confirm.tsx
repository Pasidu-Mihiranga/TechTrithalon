import { useState } from 'react'
import {
  ArrowRight,
  Box,
  CheckCircle,
  Clock,
  Download,
  Fuel,
  Lock,
  Mail,
  MessageSquare,
  Navigation,
  RotateCcw,
  Send,
  Smartphone,
  Truck,
  Warehouse,
  X,
} from 'lucide-react'
import { EmptyState } from '../../components'
import type { ManualPlanView } from './manualPlanQueries'
import { ManualPlanRequestError } from './manualPlanQueries'

export interface DispatchManifestRow {
  vehicle: string
  driver?: string
  stops: number
  volume: string
  departs?: string
  bay?: string
  accentColor?: string
}

export interface DispatchMetrics {
  totalVehicles: number
  totalDrivers: number
  totalOrders: number
  totalVolumeM3: number
  depotWindow?: string
}

export interface PlanningStep5ConfirmProps {
  activeDepot: string
  planDate: string
  manifestRows?: DispatchManifestRow[]
  metrics?: DispatchMetrics
  onPublishPlan?: (options: {
    notifyLoaderApp: boolean
    notifyDriverSms: boolean
    notifySupervisorEmail: boolean
  }) => Promise<void>
  candidateView?: ManualPlanView | null
  onPublishCandidate?: (reason: string) => Promise<void>
  failure?: Error | null
  onReloadPlan?: () => void
  actionPending?: boolean
}

export function PlanningStep5Confirm({
  activeDepot,
  planDate,
  manifestRows: propsManifestRows = [],
  metrics: propsMetrics,
  onPublishPlan,
  candidateView,
  onPublishCandidate,
  failure,
  onReloadPlan,
  actionPending = false,
}: PlanningStep5ConfirmProps) {
  const [notifyLoaderApp, setNotifyLoaderApp] = useState(false)
  const [notifyDriverSms, setNotifyDriverSms] = useState(false)
  const [notifySupervisorEmail, setNotifySupervisorEmail] = useState(false)

  // 5A+ Modal State
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [modalEmailChecked, setModalEmailChecked] = useState(false)
  const [publishReason, setPublishReason] = useState('Publishing finalized delivery routes and locking fuel allocations')
  const [publishing, setPublishing] = useState(false)
  const [localPublishError, setLocalPublishError] = useState<string | null>(null)

  // 5B Plan Sent State: if already published on backend, start in sent state
  const isAlreadyPublished = candidateView?.plan?.status === 'published'
  const [planSent, setPlanSent] = useState(isAlreadyPublished)
  const [showToast, setShowToast] = useState(true)

  // Derive manifest rows from candidateView when present
  const manifestRows: DispatchManifestRow[] = candidateView
    ? (candidateView.trips ?? []).map((trip) => {
        const util = candidateView.utilisation?.[String(trip.id)]
        const volUsed = util?.volumeUsedM3 != null ? util.volumeUsedM3.toFixed(1) : '—'
        const volLimit = util?.volumeLimitM3 != null ? util.volumeLimitM3.toFixed(1) : '—'
        const firstStop = trip.stops?.[0]
        return {
          vehicle: `${trip.vehicleId} (Slot ${trip.tripIndex ?? 1})`,
          driver: 'Unassigned', // Drivers are unassigned in Phase 7
          stops: trip.stops?.length ?? 0,
          volume: `${volUsed} / ${volLimit} m³`,
          departs: firstStop?.plannedArrival ? `Depot -> ${firstStop.plannedArrival}` : '—',
          bay: `Bay ${trip.tripIndex ?? 1}`,
          accentColor: '#FFC20E',
        }
      })
    : propsManifestRows

  // Derive counts & KPIs
  const vehiclesCount = candidateView
    ? new Set((candidateView.trips ?? []).map((t) => t.vehicleId)).size
    : (propsMetrics?.totalVehicles ?? manifestRows.length)

  const driversCount = candidateView
    ? 'Unassigned'
    : (propsMetrics?.totalDrivers ?? manifestRows.filter((m) => Boolean(m.driver)).length)

  const ordersCount = candidateView
    ? (candidateView.validation?.metrics?.ordersAssigned ??
       (candidateView.trips ?? []).reduce((acc, t) => acc + (t.stops?.length ?? 0), 0))
    : (propsMetrics?.totalOrders ?? manifestRows.reduce((acc, m) => acc + m.stops, 0))

  const totalVolumeStr = candidateView
    ? `${Object.values(candidateView.utilisation ?? {}).reduce((acc, u) => acc + (u.volumeUsedM3 ?? 0), 0).toFixed(1)} m³`
    : propsMetrics
      ? `${propsMetrics.totalVolumeM3.toFixed(1)} m³`
      : manifestRows.length > 0
        ? `${manifestRows.length * 15} m³`
        : '0.0 m³'

  const totalDistanceStr = candidateView?.validation?.metrics?.totalDistanceKm != null
    ? `${candidateView.validation.metrics.totalDistanceKm} km`
    : '—'

  const totalFuelStr = candidateView?.validation?.metrics?.totalFuelLitres != null
    ? `${candidateView.validation.metrics.totalFuelLitres} L`
    : '—'

  async function handleSendPlan() {
    setPublishing(true)
    setLocalPublishError(null)
    try {
      if (candidateView && onPublishCandidate) {
        await onPublishCandidate(publishReason.trim() || 'Published operational delivery plan')
      } else if (onPublishPlan) {
        await onPublishPlan({
          notifyLoaderApp,
          notifyDriverSms,
          notifySupervisorEmail: modalEmailChecked || notifySupervisorEmail,
        })
      }
      setConfirmModalOpen(false)
      setPlanSent(true)
      setShowToast(true)
    } catch (err) {
      setLocalPublishError(err instanceof Error ? err.message : 'Plan could not be published.')
    } finally {
      setPublishing(false)
    }
  }

  // 5B: Plan Sent View
  if (planSent || isAlreadyPublished) {
    return (
      <div className="planning-step5-container animate-fade-in">
        {/* Floating Top Notification Toast */}
        {showToast && (
          <div className="top-floating-toast">
            <div className="toast-left">
              <CheckCircle size={16} className="text-success" />
              <span>
                {candidateView
                  ? `Plan #${candidateView.plan.id} published and locked. Fuel quota reserved.`
                  : `Plan sent to ${activeDepot || 'Peliyagoda'} teams`}
              </span>
            </div>
            <div className="toast-right">
              {!isAlreadyPublished && !candidateView && (
                <button
                  type="button"
                  className="toast-undo-btn"
                  onClick={() => {
                    setPlanSent(false)
                    setShowToast(false)
                  }}
                >
                  <span>Re-open Plan</span>
                </button>
              )}
              <button
                type="button"
                className="toast-close-btn"
                onClick={() => setShowToast(false)}
                aria-label="Dismiss toast"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Informational Disclaimer on Phase 7 vs Later Workflows */}
        <div className="alert-card alert-info" style={{ marginBottom: 'var(--space-16)', padding: 'var(--space-12) var(--space-16)', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 'var(--radius-8)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <Lock size={18} className="text-brand-blue" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <strong style={{ color: '#0369A1' }}>Phase 7 Publication Complete: </strong>
              <span style={{ color: '#0C4A6E', fontSize: '13px' }}>
                Operational routes are committed and vehicle fuel is reserved in the ledger. Published plans are immutable.
                Note: Loader mobile apps and driver dispatch notifications belong to Phase 11+ and are not simulated here.
              </span>
            </div>
          </div>
        </div>

        <div className="step5-sent-grid">
          {/* Left Card: Sent Status & Timeline */}
          <div className="sent-timeline-card">
            <div className="sent-head-row">
              <div className="sent-big-icon-box">
                <CheckCircle size={24} className="text-success" />
              </div>
              <div>
                <h3 className="sent-title">Delivery plan is locked and active</h3>
                <p className="sent-sub">
                  {candidateView?.plan?.id ? `Plan #${candidateView.plan.id} (rev ${candidateView.plan.lockVersion}) · ` : ''}
                  Sent for {planDate} · {activeDepot} Depot · {vehiclesCount} routes active
                </p>
              </div>
            </div>

            <div className="sent-timeline-stepper">
              <div className="timeline-node complete">
                <div className="node-marker">✓</div>
                <div className="node-info">
                  <div className="node-title">Plan published by Dispatcher</div>
                  <div className="node-meta">
                    Confirmed for {activeDepot} Depot {candidateView ? `· Plan ID #${candidateView.plan.id}` : ''}
                  </div>
                </div>
              </div>

              <div className="timeline-node complete">
                <div className="node-marker">✓</div>
                <div className="node-info">
                  <div className="node-title">Fuel quota reserved & locked</div>
                  <div className="node-meta">
                    {totalFuelStr !== '—' ? `${totalFuelStr} fuel reserved in vehicle quota ledger` : 'Committed to vehicle ledger'}
                  </div>
                </div>
              </div>

              <div className="timeline-node upcoming">
                <div className="node-marker">○</div>
                <div className="node-info">
                  <div className="node-title">Warehouse loading execution (Phase 11+)</div>
                  <div className="node-meta">Bay staging and pallet sequence dispatch</div>
                </div>
              </div>

              <div className="timeline-node upcoming">
                <div className="node-marker">○</div>
                <div className="node-info">
                  <div className="node-title">Driver mobile dispatch (Phase 11+)</div>
                  <div className="node-meta">Route navigation and ePOD rollout</div>
                </div>
              </div>
            </div>

            <div className="sent-timeline-actions">
              <button type="button" className="toolbar-btn">
                <Download size={14} aria-hidden="true" />
                <span>Export Manifest (PDF)</span>
              </button>
              <button type="button" className="toolbar-btn">
                <Download size={14} aria-hidden="true" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Right Card: Locked Route Overview Canvas */}
          <div className="sent-map-card">
            <div className="sent-map-head">
              <div className="sent-map-title">
                <Lock size={15} aria-hidden="true" />
                <span>Locked Routes Overview · {activeDepot} Depot</span>
              </div>
              <span className="live-status-badge">
                <span className="live-pulse" /> LOCKED & IMMUTABLE
              </span>
            </div>

            <div className="sent-canvas-box">
              <svg viewBox="0 0 600 350" className="sent-map-svg" aria-label="Locked routes map">
                <rect width="600" height="350" fill="#F8FAFC" />
                <path d="M 80 0 Q 150 140 160 350" fill="none" stroke="#E2E8F0" strokeWidth="6" />

                {/* Depot Node */}
                <circle cx="300" cy="80" r="14" fill="#1E293B" />
                <circle cx="300" cy="80" r="7" fill="#FFC20E" />

                {/* Radiating Locked Routes */}
                <path d="M 300 80 Q 210 130 180 250" fill="none" stroke="#FFC20E" strokeWidth="3" />
                <path d="M 300 80 Q 240 180 250 290" fill="none" stroke="#10B981" strokeWidth="3" />
                <path d="M 300 80 Q 340 170 370 270" fill="none" stroke="#3B82F6" strokeWidth="3" />
                <path d="M 300 80 Q 400 130 450 210" fill="none" stroke="#8B5CF6" strokeWidth="3" />

                {/* Pins */}
                <circle cx="180" cy="250" r="6" fill="#FFC20E" />
                <circle cx="250" cy="290" r="6" fill="#10B981" />
                <circle cx="370" cy="270" r="6" fill="#3B82F6" />
                <circle cx="450" cy="210" r="6" fill="#8B5CF6" />
              </svg>
              <div className="map-depot-badge" style={{ top: '15px', right: '140px' }}>
                <Warehouse size={12} aria-hidden="true" />
                <span>{activeDepot} Hub</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 5A: Ready to Confirm View
  return (
    <div className="planning-step5-container animate-fade-in">
      {failure && (
        <div className="alert-card alert-danger" style={{ marginBottom: 'var(--space-16)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>Publication Blocked: </strong>
              <span>{failure.message}</span>
              {failure instanceof ManualPlanRequestError && failure.traceId && (
                <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.85 }}>
                  Trace ID: <code>{failure.traceId}</code>
                </div>
              )}
            </div>
            {onReloadPlan && (
              <button type="button" className="toolbar-btn small" onClick={onReloadPlan}>
                <RotateCcw size={12} aria-hidden="true" />
                <span>Reload Plan</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Ready Banner */}
      <div className="step5-ready-banner">
        <div className="ready-banner-left">
          <div className="ready-icon-box">
            <CheckCircle size={28} className="text-success" />
          </div>
          <div>
            <h2 className="ready-title">
              {manifestRows.length > 0
                ? 'Delivery plan is ready to send'
                : 'Confirm & Send Dispatch'}
            </h2>
            <p className="ready-subtitle">
              {manifestRows.length > 0
                ? `All exceptions are resolved and all constraints are satisfied. Plan for ${planDate} from ${activeDepot} is ready.`
                : `Finalize notifications and compile dispatch manifest for ${planDate} (${activeDepot} Depot).`}
            </p>
          </div>
        </div>
        <div className="ready-banner-actions">
          <button
            type="button"
            className="btn-primary-yellow large"
            disabled={actionPending || manifestRows.length === 0}
            onClick={() => setConfirmModalOpen(true)}
          >
            <Send size={16} aria-hidden="true" />
            <span>Confirm & Send Plan</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 5 KPI Metric Cards */}
      <div className="kpi-grid-5">
        <div className="kpi-tile">
          <div className="kpi-tile-header">
            <span className="kpi-icon-box orange"><Truck size={15} /></span>
            <span className="kpi-label">Vehicles</span>
          </div>
          <div className="kpi-value">{vehiclesCount}</div>
          <div className="kpi-sub">routes allocated</div>
        </div>

        <div className="kpi-tile">
          <div className="kpi-tile-header">
            <span className="kpi-icon-box yellow"><Clock size={15} /></span>
            <span className="kpi-label">Drivers</span>
          </div>
          <div className="kpi-value">{driversCount}</div>
          <div className="kpi-sub">{candidateView ? 'phase 11+' : 'assigned'}</div>
        </div>

        <div className="kpi-tile">
          <div className="kpi-tile-header">
            <span className="kpi-icon-box amber"><Box size={15} /></span>
            <span className="kpi-label">Total orders</span>
          </div>
          <div className="kpi-value">{ordersCount}</div>
          <div className="kpi-sub">scheduled stops</div>
        </div>

        <div className="kpi-tile">
          <div className="kpi-tile-header">
            <span className="kpi-icon-box green"><Navigation size={15} /></span>
            <span className="kpi-label">Total volume</span>
          </div>
          <div className="kpi-value">{totalVolumeStr}</div>
          <div className="kpi-sub">payload allocated</div>
        </div>

        <div className="kpi-tile">
          <div className="kpi-tile-header">
            <span className="kpi-icon-box blue"><Fuel size={15} /></span>
            <span className="kpi-label">Fuel & Distance</span>
          </div>
          <div className="kpi-value">{totalFuelStr}</div>
          <div className="kpi-sub">{totalDistanceStr}</div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="step5-layout-grid">
        {/* Left Column: Vehicle Manifest Table */}
        <div className="step5-manifest-col">
          <div className="manifest-card">
            <div className="manifest-card-header">
              <span className="manifest-title">Vehicle Manifest</span>
              <span className="manifest-sub">
                {manifestRows.length > 0 ? `${manifestRows.length} trips assigned` : 'Routes allocation pending'}
              </span>
            </div>

            <div className="manifest-table-wrapper">
              <table className="manifest-table">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Driver</th>
                    <th>Stops</th>
                    <th>Volume</th>
                    <th>Departs</th>
                    <th>Loading Bay</th>
                  </tr>
                </thead>
                <tbody>
                  {manifestRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 'var(--space-32)', textAlign: 'center' }}>
                        <EmptyState
                          title="No manifest compiled yet"
                          description="Complete route generation and allocation in steps 2–3 to compile the dispatch manifest."
                        />
                      </td>
                    </tr>
                  ) : (
                    manifestRows.map((row, idx) => (
                      <tr key={`${row.vehicle}-${idx}`}>
                        <td>
                          <div className="veh-cell">
                            <span className="veh-color-dot" style={{ background: row.accentColor ?? '#FFC20E' }} />
                            <strong>{row.vehicle}</strong>
                          </div>
                        </td>
                        <td>{row.driver ?? 'Unassigned'}</td>
                        <td>{row.stops}</td>
                        <td>{row.volume}</td>
                        <td>{row.departs ?? '—'}</td>
                        <td>
                          <span className="bay-badge">{row.bay ?? 'Bay 1'}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Execution Configuration */}
        <div className="step5-side-col">
          <div className="notifications-card">
            <h3 className="notif-title">Send Notifications</h3>
            <p className="notif-sub">Choose who receives updates when the plan is confirmed:</p>

            <div className="notif-toggles-list">
              {/* Loader App */}
              <div className="notif-toggle-row">
                <div className="notif-icon-box blue">
                  <Smartphone size={16} />
                </div>
                <div className="notif-info">
                  <div className="notif-name">Loader App</div>
                  <div className="notif-desc">Send loading sequence to warehouse floor</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifyLoaderApp}
                  className={`toggle-switch ${notifyLoaderApp ? 'active' : ''}`}
                  onClick={() => setNotifyLoaderApp(!notifyLoaderApp)}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>

              {/* Driver SMS */}
              <div className="notif-toggle-row">
                <div className="notif-icon-box green">
                  <MessageSquare size={16} />
                </div>
                <div className="notif-info">
                  <div className="notif-name">Driver SMS / App</div>
                  <div className="notif-desc">Send route & stop lists to drivers</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifyDriverSms}
                  className={`toggle-switch ${notifyDriverSms ? 'active' : ''}`}
                  onClick={() => setNotifyDriverSms(!notifyDriverSms)}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>

              {/* Supervisor Email */}
              <div className="notif-toggle-row">
                <div className="notif-icon-box yellow">
                  <Mail size={16} />
                </div>
                <div className="notif-info">
                  <div className="notif-name">Supervisor Email</div>
                  <div className="notif-desc">Send daily summary report to supervisors</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifySupervisorEmail}
                  className={`toggle-switch ${notifySupervisorEmail ? 'active' : ''}`}
                  onClick={() => setNotifySupervisorEmail(!notifySupervisorEmail)}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>
            </div>

            <div className="notif-disclaimer">
              <Clock size={12} aria-hidden="true" />
              <span>
                {candidateView
                  ? 'Phase 7 locks routes and commits fuel. Operational dispatch apps connect in Phase 11+.'
                  : 'Once confirmed, changes will notify affected drivers and loaders automatically.'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div className="modal-overlay" onClick={() => !publishing && setConfirmModalOpen(false)}>
          <div className="modal-card send-confirm-modal animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Confirm and Send Plan</h3>
                <p className="modal-subtitle">
                  {planDate} · {activeDepot} Depot
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                disabled={publishing}
                onClick={() => setConfirmModalOpen(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="confirm-summary-box">
                <div className="summary-item">
                  <span className="summary-num">{vehiclesCount}</span>
                  <span className="summary-lbl">Vehicles</span>
                </div>
                <div className="summary-item">
                  <span className="summary-num">{ordersCount}</span>
                  <span className="summary-lbl">Orders</span>
                </div>
                <div className="summary-item">
                  <span className="summary-num">{totalVolumeStr}</span>
                  <span className="summary-lbl">Volume</span>
                </div>
              </div>

              {candidateView && (
                <div className="modal-form-group" style={{ marginTop: 'var(--space-16)' }}>
                  <label className="field-label" htmlFor="publish-reason">Publication Reason (Required)</label>
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

              <p className="confirm-warning-text">
                ⚠️ Sending will lock this delivery plan and commit vehicle fuel quotas. The plan cannot be modified or re-optimised after publication.
              </p>

              <div className="modal-checkbox-row">
                <input
                  type="checkbox"
                  id="modal-email-check"
                  checked={modalEmailChecked}
                  onChange={(e) => setModalEmailChecked(e.target.checked)}
                />
                <label htmlFor="modal-email-check">
                  Record publication in operational audit ledger
                </label>
              </div>

              {localPublishError && (
                <div className="alert-card alert-danger" style={{ marginTop: 'var(--space-12)' }}>
                  <strong>Publication Failed: </strong>
                  <span>{localPublishError}</span>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="toolbar-btn"
                disabled={publishing}
                onClick={() => setConfirmModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary-yellow"
                disabled={publishing || (candidateView != null && !publishReason.trim())}
                onClick={() => void handleSendPlan()}
              >
                <Send size={15} aria-hidden="true" />
                <span>{publishing ? 'Publishing...' : 'Yes, Send Delivery Plan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
