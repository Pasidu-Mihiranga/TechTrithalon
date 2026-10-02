import { useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle,
  Clock,
  Eye,
  Sparkles,
  TrendingUp,
  Truck,
} from 'lucide-react'

export interface PlanningStep4ExceptionsProps {
  onContinueToConfirm: () => void
}

interface ExceptionItem {
  id: string
  ref: string
  outletName: string
  flag: string
  window: string
  volume: string
  violationTitle: string
  violationDescription: string
  suggestedFix: string
  fixActionLabel: string
  category: 'van' | 'reefer' | 'capacity' | 'window'
  status: 'open' | 'resolved'
  resolutionNote?: string
}

const INITIAL_EXCEPTIONS: ExceptionItem[] = [
  {
    id: '1',
    ref: 'ORD-1223',
    outletName: 'Waypoint Tech Rajagiriya',
    flag: 'Van only',
    window: '10:00–12:00',
    volume: '4.5 m³',
    violationTitle: 'Van-only access',
    violationDescription:
      'No van has room in the 10:00–14:00 window. VEH065 is the only van on Rajagiriya routes and is at 94% (9.4 / 10 m³).',
    suggestedFix: 'Activate standby van VEH072 (Van 1T, 10 m³) to cover Rajagiriya spillover',
    fixActionLabel: 'Activate standby van',
    category: 'van',
    status: 'open',
  },
  {
    id: '2',
    ref: 'ORD-1204',
    outletName: 'Waypoint Fresh Nugegoda',
    flag: 'Refrigerated',
    window: '06:00–08:00',
    volume: '4.8 m³',
    violationTitle: 'No refrigerated vehicle available',
    violationDescription:
      'All 16 chilled-capable reefers have reached 98% volume capacity before the Nugegoda delivery window.',
    suggestedFix: 'Defer to Wednesday 30 Sep run with protected priority #1',
    fixActionLabel: 'Defer to Wed',
    category: 'reefer',
    status: 'open',
  },
  {
    id: '3',
    ref: 'ORD-1186',
    outletName: 'Waypoint Express Mt Lavinia',
    flag: 'Normal',
    window: '08:00–09:30',
    volume: '3.1 m³',
    violationTitle: 'Window conflict',
    violationDescription:
      'Vehicle VEH021 ETA is 08:35 due to Galle Road morning traffic buffer, risking a 5-minute window slip.',
    suggestedFix: 'Shift delivery window to 08:30–10:00 (Store approved)',
    fixActionLabel: 'Accept window shift',
    category: 'window',
    status: 'open',
  },
  {
    id: '4',
    ref: 'ORD-1152',
    outletName: 'Waypoint Wholesale Colombo 03',
    flag: 'High Volume',
    window: '07:00–09:00',
    volume: '6.2 m³',
    violationTitle: 'Capacity overflow',
    violationDescription:
      'Order exceeds single-pallet slot allowance on Lorry VEH014 by 0.8 m³.',
    suggestedFix: 'Re-assign 2 items to VEH033 which has 14% free capacity',
    fixActionLabel: 'Split across VEH033',
    category: 'capacity',
    status: 'open',
  },
]

export function PlanningStep4Exceptions({ onContinueToConfirm }: PlanningStep4ExceptionsProps) {
  const [exceptions, setExceptions] = useState<ExceptionItem[]>(INITIAL_EXCEPTIONS)
  const [activeCategory, setActiveCategory] = useState<'all' | 'van' | 'reefer' | 'capacity' | 'window'>('all')
  const [showResolved, setShowResolved] = useState(false)

  // Defer Modal (4A+) State
  const [deferModalOpen, setDeferModalOpen] = useState(false)
  const [targetDeferItem, setTargetDeferItem] = useState<ExceptionItem | null>(null)
  const [deferReason, setDeferReason] = useState('No refrigerated space on Colombo Fresh trips')
  const [storeNote, setStoreNote] = useState(
    'All 16 chilled-capable vehicles are full on Tue 29 Sep. Your order is first on the Wed 30 Sep run.'
  )
  const [notifyStore, setNotifyStore] = useState(true)
  const [protectNextRun, setProtectNextRun] = useState(true)

  const openCount = exceptions.filter((e) => e.status === 'open').length
  const resolvedCount = exceptions.filter((e) => e.status === 'resolved').length
  const isAllResolved = openCount === 0

  function handleResolve(id: string, note?: string) {
    setExceptions((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: 'resolved', resolutionNote: note || 'Suggested fix applied' } : e))
    )
  }

  function handleAcceptAll() {
    setExceptions((prev) =>
      prev.map((e) => ({
        ...e,
        status: 'resolved',
        resolutionNote: 'Accepted system fix',
      }))
    )
  }

  function handleOpenDefer(item: ExceptionItem) {
    setTargetDeferItem(item)
    setDeferModalOpen(true)
  }

  function handleConfirmDefer() {
    if (targetDeferItem) {
      handleResolve(targetDeferItem.id, `Deferred to Wed 30 Sep: ${deferReason}`)
    }
    setDeferModalOpen(false)
  }

  const filteredExceptions = exceptions.filter((e) => {
    if (!showResolved && e.status === 'resolved') return false
    if (activeCategory === 'all') return true
    return e.category === activeCategory
  })

  // 4B: All Exceptions Resolved State
  if (isAllResolved) {
    return (
      <div className="planning-step4-container animate-fade-in">
        <div className="all-resolved-card">
          <div className="celebration-badge-container">
            <div className="celebration-circle">
              <Check size={36} className="text-white" />
            </div>
            {/* Confetti dots */}
            <div className="confetti c1" />
            <div className="confetti c2" />
            <div className="confetti c3" />
            <div className="confetti c4" />
            <div className="confetti c5" />
          </div>

          <h2 className="all-resolved-title">All exceptions resolved</h2>
          <p className="all-resolved-subtitle">
            185 of 186 orders are allocated across 15 vehicles. 1 order was deferred to Wednesday 30 Sep and is waiting in Deferred Orders.
          </p>

          {/* 4 Metrics Tiles */}
          <div className="kpi-grid-4">
            <div className="kpi-tile">
              <div className="kpi-tile-header">
                <span className="kpi-icon-box green"><CheckCircle size={15} /></span>
                <span className="kpi-label">Allocated</span>
              </div>
              <div className="kpi-value">185</div>
              <div className="kpi-sub">of 186 orders</div>
            </div>

            <div className="kpi-tile">
              <div className="kpi-tile-header">
                <span className="kpi-icon-box orange"><Clock size={15} /></span>
                <span className="kpi-label">Deferred</span>
              </div>
              <div className="kpi-value">1</div>
              <div className="kpi-sub">Wed 30 Sep</div>
            </div>

            <div className="kpi-tile">
              <div className="kpi-tile-header">
                <span className="kpi-icon-box yellow"><Truck size={15} /></span>
                <span className="kpi-label">Vehicles</span>
              </div>
              <div className="kpi-value">15</div>
              <div className="kpi-sub">incl. 1 standby van</div>
            </div>

            <div className="kpi-tile">
              <div className="kpi-tile-header">
                <span className="kpi-icon-box teal"><CheckCircle size={15} /></span>
                <span className="kpi-label">On-time windows</span>
              </div>
              <div className="kpi-value">100%</div>
              <div className="kpi-sub">every stop in window</div>
            </div>
          </div>

          {/* Resolution Audit Log Table */}
          <div className="resolution-audit-card">
            <div className="audit-head">
              <span className="audit-title">Resolution log</span>
              <span className="audit-sub">Saved to audit trail</span>
            </div>
            <div className="audit-list">
              {exceptions.map((ex) => (
                <div key={ex.id} className="audit-row">
                  <div className="audit-row-left">
                    <CheckCircle size={15} className="text-success" />
                    <strong>{ex.ref}</strong>
                    <span>{ex.outletName}</span>
                  </div>
                  <div className="audit-row-note">{ex.resolutionNote || ex.suggestedFix}</div>
                  <span className="badge-resolved">Resolved</span>
                </div>
              ))}
            </div>
          </div>

          <div className="all-resolved-footer">
            <button
              type="button"
              className="btn-primary-yellow large"
              onClick={onContinueToConfirm}
            >
              <span>Continue to Confirm & Send</span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 4A: Exceptions Triage State
  return (
    <div className="planning-step4-container animate-fade-in">
      {/* Alert Warning Banner */}
      <div className="exceptions-banner">
        <div className="exceptions-banner-left">
          <div className="exceptions-banner-icon">
            <AlertTriangle size={24} className="text-warning" />
          </div>
          <div>
            <div className="exceptions-banner-title">
              {openCount} orders still need a decision
            </div>
            <div className="exceptions-banner-subtitle">
              6 orders couldn't be placed automatically. Each has a ranked fix; apply it, pick an alternative, or defer to Wednesday.
            </div>
          </div>
        </div>

        <div className="exceptions-banner-right">
          <div className="exceptions-progress-group">
            <div className="exceptions-progress-label">
              <span>{resolvedCount + 2} of 6 resolved</span>
              <span className="pct">33%</span>
            </div>
            <div className="exceptions-progress-track">
              <div
                className="exceptions-progress-fill"
                style={{ width: `${Math.round(((resolvedCount + 2) / 6) * 100)}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            className="btn-primary-yellow"
            onClick={handleAcceptAll}
          >
            <Sparkles size={16} aria-hidden="true" />
            <span>Accept all suggestions</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="exceptions-filter-bar">
        <div className="exceptions-tabs">
          <button
            type="button"
            className={`filter-pill ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            <span>All open</span>
            <span className="pill-badge">{openCount}</span>
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategory === 'van' ? 'active' : ''}`}
            onClick={() => setActiveCategory('van')}
          >
            <span>Van-only access</span>
            <span className="pill-badge">1</span>
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategory === 'reefer' ? 'active' : ''}`}
            onClick={() => setActiveCategory('reefer')}
          >
            <span>No refrigerated vehicle</span>
            <span className="pill-badge">1</span>
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategory === 'capacity' ? 'active' : ''}`}
            onClick={() => setActiveCategory('capacity')}
          >
            <span>Capacity overflow</span>
            <span className="pill-badge">1</span>
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategory === 'window' ? 'active' : ''}`}
            onClick={() => setActiveCategory('window')}
          >
            <span>Window conflict</span>
            <span className="pill-badge">1</span>
          </button>
        </div>

        <button
          type="button"
          className="text-btn flex-center"
          onClick={() => setShowResolved(!showResolved)}
        >
          <Eye size={14} aria-hidden="true" />
          <span>{showResolved ? 'Hide resolved' : `Show resolved (${resolvedCount})`}</span>
        </button>
      </div>

      {/* Triage Layout: Left Cards, Right Impact */}
      <div className="exceptions-triage-grid">
        {/* Left Column: Triage Cards */}
        <div className="triage-cards-col">
          {filteredExceptions.map((item) => (
            <div key={item.id} className="triage-card">
              <div className="triage-card-accent" />
              <div className="triage-card-content">
                {/* Header */}
                <div className="triage-card-head">
                  <div className="triage-order-info">
                    <Truck size={16} className="text-secondary" aria-hidden="true" />
                    <span className="triage-ref">{item.ref}</span>
                    <span className="triage-outlet">{item.outletName}</span>
                    <span className="flag-badge">{item.flag}</span>
                  </div>
                  <div className="triage-meta-group">
                    <span className="triage-meta-window">{item.window}</span>
                    <span className="triage-meta-dot">·</span>
                    <span className="triage-meta-vol">{item.volume}</span>
                  </div>
                </div>

                {/* Violation Details */}
                <div className="triage-violation-section">
                  <div className="violation-title">{item.violationTitle}</div>
                  <p className="violation-desc">{item.violationDescription}</p>
                </div>

                {/* Suggested Fix Amber Box */}
                <div className="suggested-fix-box">
                  <div className="suggested-fix-head">
                    <span className="suggested-fix-tag">SUGGESTED FIX · BEST OF 3</span>
                  </div>
                  <div className="suggested-fix-desc">{item.suggestedFix}</div>

                  <div className="suggested-fix-actions">
                    <button
                      type="button"
                      className="btn-apply-fix"
                      onClick={() => handleResolve(item.id)}
                    >
                      <Check size={14} aria-hidden="true" />
                      <span>{item.fixActionLabel}</span>
                    </button>
                    <button
                      type="button"
                      className="btn-alt-action"
                      onClick={() => handleOpenDefer(item)}
                    >
                      <span>Choose vehicle...</span>
                    </button>
                    <button
                      type="button"
                      className="btn-alt-action"
                      onClick={() => handleOpenDefer(item)}
                    >
                      <span>Defer...</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right Column: Impact of Applying All */}
        <div className="triage-side-col">
          <div className="impact-card">
            <div className="impact-card-head">
              <TrendingUp size={16} className="text-warning" aria-hidden="true" />
              <span className="impact-card-title">Impact of applying all 4</span>
            </div>

            <div className="impact-rows">
              <div className="impact-row">
                <span className="impact-label">Orders allocated</span>
                <span className="impact-metric">181 → <strong>185</strong></span>
              </div>
              <div className="impact-row">
                <span className="impact-label">Deferred</span>
                <span className="impact-metric">1 → <strong>1</strong></span>
              </div>
              <div className="impact-row">
                <span className="impact-label">Vehicles</span>
                <span className="impact-metric">14 → <strong>15</strong></span>
              </div>
              <div className="impact-row">
                <span className="impact-label">Avg utilisation</span>
                <span className="impact-metric">87% → <strong>88%</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal 4A+: Defer Order (Reason Required) */}
      {deferModalOpen && targetDeferItem && (
        <div className="modal-overlay" onClick={() => setDeferModalOpen(false)}>
          <div className="modal-dialog-card animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-head-title-row">
                <h3 className="modal-title">Defer {targetDeferItem.ref}</h3>
                <span className="badge-defer-skip">2nd skip</span>
              </div>
              <p className="modal-subtitle">
                {targetDeferItem.outletName} · {targetDeferItem.volume} · window {targetDeferItem.window}
              </p>
            </div>

            <div className="modal-section-label">
              REASON <span className="text-danger">required</span>
            </div>

            <div className="defer-reasons-list">
              {[
                'No refrigerated space on Colombo Fresh trips',
                'Capacity overflow on all feasible vehicles',
                'Outside delivery window',
                'No van available for a van-only outlet',
                'Other (add a note)',
              ].map((r) => (
                <label key={r} className={`defer-radio-option ${deferReason === r ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="defer-reason"
                    value={r}
                    checked={deferReason === r}
                    onChange={() => setDeferReason(r)}
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>

            <div className="defer-note-field">
              <label className="field-label" htmlFor="defer-store-note">
                NOTE FOR THE STORE (OPTIONAL)
              </label>
              <textarea
                id="defer-store-note"
                rows={2}
                className="defer-textarea"
                value={storeNote}
                onChange={(e) => setStoreNote(e.target.value)}
              />
            </div>

            {/* Warning Callout Box */}
            <div className="defer-warning-box">
              <div className="defer-warning-head">What this means</div>
              <ul className="defer-warning-bullets">
                <li>OUT031 will be skipped two runs in a row — it was also deferred on Sat 27 Sep.</li>
                <li>Days since last served becomes 4 on the delivery day.</li>
                <li>The order moves to the Wed 30 Sep run and is protected as first priority.</li>
              </ul>
            </div>

            {/* Toggles */}
            <div className="defer-toggles-section">
              <div className="defer-toggle-row">
                <div>
                  <div className="defer-toggle-title">Notify the store manager now</div>
                  <div className="defer-toggle-sub">On by default — sends the reason and the new date</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifyStore}
                  className={`toggle-switch ${notifyStore ? 'active' : ''}`}
                  onClick={() => setNotifyStore(!notifyStore)}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>

              <div className="defer-toggle-row">
                <div>
                  <div className="defer-toggle-title">Protect on the next run</div>
                  <div className="defer-toggle-sub">Places OUT031 first on Wed 30 Sep</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={protectNextRun}
                  className={`toggle-switch ${protectNextRun ? 'active' : ''}`}
                  onClick={() => setProtectNextRun(!protectNextRun)}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>
            </div>

            <div className="defer-modal-footer">
              <div className="defer-footer-audit">
                Recorded as Dilani Mendis · Mon 28 Sep 16:42
              </div>
              <div className="defer-footer-btns">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setDeferModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-modal-defer-confirm"
                  onClick={handleConfirmDefer}
                >
                  Defer and notify store
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
