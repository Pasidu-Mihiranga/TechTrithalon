import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle,
  Clock,
  Eye,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Truck,
  X,
} from 'lucide-react'
import type { Edit, ManualPlanView } from './manualPlanQueries'
import { ManualPlanRequestError } from './manualPlanQueries'
import { DeferDecisionFields, EMPTY_DEFER_DECISION, deferDecisionBody, deferDecisionReady, type DeferDecision } from './DeferDecisionFields'

export interface PlanningExceptionItem {
  id: string
  ref: string
  outletName: string
  flag: string
  window: string
  volume: string
  violationTitle: string
  violationDescription: string
  suggestedFix?: string
  fixActionLabel?: string
  category: 'van' | 'reefer' | 'capacity' | 'window' | 'other'
  status: 'open' | 'resolved'
  resolutionNote?: string
}

export interface PlanningStep4ExceptionsProps {
  exceptions?: PlanningExceptionItem[]
  onResolveException?: (id: string, action: string) => void
  onDeferOrder?: (id: string, reason: string, nextDate: string) => void
  onContinueToConfirm: () => void
  candidateView?: ManualPlanView | null
  failure?: Error | null
  onApplyCommand?: (edit: Edit) => Promise<boolean | void>
  onReloadPlan?: () => void
  actionPending?: boolean
}

export function PlanningStep4Exceptions({
  exceptions: initialExceptions = [],
  onResolveException,
  onDeferOrder,
  onContinueToConfirm,
  candidateView,
  failure,
  onApplyCommand,
  onReloadPlan,
  actionPending = false,
}: PlanningStep4ExceptionsProps) {
  // Test/synthetic mock fallback state
  const [mockExceptions, setMockExceptions] = useState<PlanningExceptionItem[]>(initialExceptions)
  const [activeCategory, setActiveCategory] = useState<'all' | 'van' | 'reefer' | 'capacity' | 'window'>('all')
  const [showResolved, setShowResolved] = useState(false)

  // Defer Modal State
  const [deferModalOpen, setDeferModalOpen] = useState(false)
  const [deferTarget, setDeferTarget] = useState<{ id: string; orderId?: number; ref: string; outletName: string; volume: string } | null>(null)
  const [deferDecision, setDeferDecision] = useState<DeferDecision>(EMPTY_DEFER_DECISION)

  // Derive real exceptions from candidateView if provided
  const realViolations = useMemo(() => {
    if (!candidateView) return []
    const list = [...(candidateView.validation?.violations ?? [])]
    if (failure instanceof ManualPlanRequestError && failure.violations?.length) {
      for (const v of failure.violations) {
        if (!list.some(existing => existing.ruleCode === v.ruleCode && existing.entityId === v.entityId && existing.entityType === v.entityType)) {
          list.push(v)
        }
      }
    }
    return list
  }, [candidateView, failure])

  const realUnassigned = useMemo(() => {
    return candidateView?.unassignedOrders ?? []
  }, [candidateView])

  const pendingUnassigned = useMemo(() => {
    return realUnassigned.filter((u) => u.disposition !== 'DEFERRED')
  }, [realUnassigned])

  const deferredUnassigned = useMemo(() => {
    return realUnassigned.filter((u) => u.disposition === 'DEFERRED')
  }, [realUnassigned])

  // Map real items into PlanningExceptionItem structure
  const realMappedExceptions: PlanningExceptionItem[] = useMemo(() => {
    if (!candidateView) return []
    const items: PlanningExceptionItem[] = []

    // 1. Hard violations
    for (let i = 0; i < realViolations.length; i++) {
      const v = realViolations[i]
      const code = v.ruleCode ?? 'RULE_VIOLATION'
      let cat: PlanningExceptionItem['category'] = 'other'
      if (code.includes('CAPACITY') || code.includes('OVERLOAD') || code.includes('WEIGHT') || code.includes('VOLUME')) cat = 'capacity'
      else if (code.includes('VAN') || code.includes('PARKING')) cat = 'van'
      else if (code.includes('REEFER') || code.includes('TEMP') || code.includes('COLD')) cat = 'reefer'
      else if (code.includes('WINDOW') || code.includes('TIME') || code.includes('LATE')) cat = 'window'

      const isOrderViolation = v.entityType === 'ORDER' && v.entityId
      const orderId = isOrderViolation ? Number(v.entityId) : undefined
      const label = v.entityType && v.entityId ? `${v.entityType} ${v.entityId}` : (v.entityId ?? 'Constraint')

      items.push({
        id: `viol-${i}-${code}`,
        ref: label,
        outletName: v.message || 'Constraint violation',
        flag: code,
        window: v.allowedValue ? `Allowed: ${v.allowedValue}` : 'Hard Rule',
        volume: v.actualValue ? `Actual: ${v.actualValue}` : 'Constraint',
        violationTitle: code,
        violationDescription: `${v.message || 'Hard operational rule violated'}${v.remediationCode ? ` (Remediation: ${v.remediationCode})` : ''}`,
        suggestedFix: !isNaN(Number(orderId)) ? `Defer Order #${orderId} or adjust route stops` : 'Adjust vehicle allocation or stop sequence',
        fixActionLabel: !isNaN(Number(orderId)) ? 'Defer Order' : undefined,
        category: cat,
        status: 'open',
      })
    }

    // 2. Unassigned orders (pending)
    for (const u of pendingUnassigned) {
      const order = u.order
      if (order?.id == null) continue
      const isChilled = order?.temp === 'chilled'
      items.push({
        id: `unassigned-${order.id}`,
        ref: order?.orderRef ?? `Order #${order?.id}`,
        outletName: order?.outletId ?? 'Unassigned Outlet',
        flag: isChilled ? '❄️ Cold Chain' : 'Ambient',
        window: 'Pending run assignment',
        volume: order?.volumeM3 != null ? `${order.volumeM3.toFixed(1)} m³` : '—',
        violationTitle: 'Unassigned Order',
        violationDescription: 'Order was frozen in planning snapshot but has not been scheduled on any delivery trip.',
        suggestedFix: 'Assign order to a trip in Step 3 or defer to a later operating date.',
        fixActionLabel: 'Defer Order',
        category: isChilled ? 'reefer' : 'capacity',
        status: 'open',
      })
    }

    // 3. Deferred orders (resolved)
    for (const u of deferredUnassigned) {
      const order = u.order
      if (order?.id == null) continue
      items.push({
        id: `deferred-${order.id}`,
        ref: order?.orderRef ?? `Order #${order?.id}`,
        outletName: order?.outletId ?? 'Deferred Outlet',
        flag: 'Deferred',
        window: u.nextDeliveryDate ? `Next: ${u.nextDeliveryDate}` : 'Next operating run',
        volume: order?.volumeM3 != null ? `${order.volumeM3.toFixed(1)} m³` : '—',
        violationTitle: 'Order Deferred',
        violationDescription: u.reason || 'Deferred to next run',
        resolutionNote: `Deferred: ${u.reason || 'Supervisor deferral'}${u.nextDeliveryDate ? ` (next: ${u.nextDeliveryDate})` : ''}`,
        category: 'other',
        status: 'resolved',
      })
    }

    return items
  }, [candidateView, realViolations, pendingUnassigned, deferredUnassigned])

  // Active items list: real candidate view vs test mock
  const activeExceptions = candidateView ? realMappedExceptions : mockExceptions

  const openExceptions = activeExceptions.filter((e) => e.status === 'open')
  const resolvedExceptions = activeExceptions.filter((e) => e.status === 'resolved')

  // Real compliance condition
  const isPlanCompliant = candidateView
    ? Boolean(candidateView.validation?.feasible && realViolations.length === 0 && pendingUnassigned.length === 0)
    : (activeExceptions.length > 0 && openExceptions.length === 0) || activeExceptions.length === 0

  const filteredExceptions = activeExceptions.filter((e) => {
    if (!showResolved && e.status === 'resolved') return false
    if (activeCategory === 'all') return true
    return e.category === activeCategory
  })

  function handleOpenDeferModal(ex: PlanningExceptionItem) {
    let orderId: number | undefined
    if (candidateView) {
      const foundPending = pendingUnassigned.find((u) => u.order?.orderRef === ex.ref || `Order #${u.order?.id}` === ex.ref)
      if (foundPending?.order?.id) orderId = foundPending.order.id
      else if (ex.id.startsWith('unassigned-')) {
        const parsed = Number(ex.id.replace('unassigned-', ''))
        if (!isNaN(parsed)) orderId = parsed
      }
    }
    setDeferTarget({ id: ex.id, orderId, ref: ex.ref, outletName: ex.outletName, volume: ex.volume })
    setDeferDecision(EMPTY_DEFER_DECISION)
    setDeferModalOpen(true)
  }

  async function handleConfirmDefer() {
    if (!deferTarget) return

    if (candidateView && onApplyCommand && deferTarget.orderId) {
      const saved = await onApplyCommand({
        operation: 'defer',
        orderId: deferTarget.orderId,
        body: { expectedVersion: candidateView.plan.lockVersion as number, ...deferDecisionBody(deferDecision) },
      })
      if (saved === false) return
    } else if (onDeferOrder) {
      onDeferOrder(deferTarget.id, deferDecision.reason, deferDecision.nextDeliveryDate)
    }

    // Update local test state if running under mock test
    if (!candidateView) {
      setMockExceptions((prev) =>
        prev.map((item) =>
          item.id === deferTarget.id
            ? { ...item, status: 'resolved', resolutionNote: `Deferred: ${deferDecision.reason} (next: ${deferDecision.nextDeliveryDate})` }
            : item
        )
      )
    }

    setDeferModalOpen(false)
  }

  async function handleRestoreOrder(orderId?: number, id?: string) {
    if (candidateView && onApplyCommand && orderId) {
      const saved = await onApplyCommand({
        operation: 'restore',
        orderId,
        body: {
          expectedVersion: candidateView.plan.lockVersion as number,
          reason: 'Restoring deferred order to candidate backlog',
        },
      })
      if (saved === false) return
    } else if (!candidateView && id) {
      setMockExceptions((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: 'open', resolutionNote: undefined } : item
        )
      )
    }
  }

  function handleMockQuickResolve(ex: PlanningExceptionItem) {
    if (onResolveException) {
      onResolveException(ex.id, ex.suggestedFix ?? 'Resolved')
    }
    setMockExceptions((prev) =>
      prev.map((item) =>
        item.id === ex.id
          ? { ...item, status: 'resolved', resolutionNote: ex.suggestedFix ?? 'Applied resolution' }
          : item
      )
    )
  }

  // 4B All Resolved Celebration
  if (isPlanCompliant) {
    return (
      <div className="planning-step4-container animate-fade-in">
        {failure && (
          <div className="alert-card alert-danger" style={{ marginBottom: 'var(--space-16)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Operation Rejected: </strong>
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

        <div className="step4-all-resolved-card">
          <div className="celebration-badge-box">
            <div className="check-circle-outer">
              <CheckCircle size={56} className="text-success" />
            </div>
          </div>

          <h2 className="celebration-title">
            {resolvedExceptions.length === 0 ? 'Zero Exceptions Detected' : 'All Exceptions Resolved'}
          </h2>
          <p className="celebration-subtitle">
            {resolvedExceptions.length === 0
              ? 'All orders satisfy routing rules, temperature requirements, and delivery windows. The plan is fully compliant.'
              : `All exceptions have been addressed. ${deferredUnassigned.length > 0 ? `${deferredUnassigned.length} order(s) explicitly deferred with recorded reasons.` : ''} The delivery plan is ready to be confirmed.`}
          </p>

          <div className="kpi-grid-4 celebration-kpis">
            <div className="kpi-tile">
              <div className="kpi-tile-header">
                <span className="kpi-icon-box green"><Check size={16} /></span>
                <span className="kpi-label">Exceptions</span>
              </div>
              <div className="kpi-value">{openExceptions.length} open</div>
              <div className="kpi-sub">{resolvedExceptions.length} resolved</div>
            </div>

            <div className="kpi-tile">
              <div className="kpi-tile-header">
                <span className="kpi-icon-box amber"><Clock size={16} /></span>
                <span className="kpi-label">Deferred</span>
              </div>
              <div className="kpi-value">
                {candidateView ? deferredUnassigned.length : resolvedExceptions.filter((e) => e.resolutionNote?.startsWith('Deferred')).length}
              </div>
              <div className="kpi-sub">moved to next run</div>
            </div>

            <div className="kpi-tile">
              <div className="kpi-tile-header">
                <span className="kpi-icon-box teal"><TrendingUp size={16} /></span>
                <span className="kpi-label">SLA Compliance</span>
              </div>
              <div className="kpi-value">100%</div>
              <div className="kpi-sub">hard constraints met</div>
            </div>

            <div className="kpi-tile">
              <div className="kpi-tile-header">
                <span className="kpi-icon-box orange"><Truck size={16} /></span>
                <span className="kpi-label">Fleet Status</span>
              </div>
              <div className="kpi-value">{candidateView?.validation?.feasible ? 'Feasible' : 'Ready'}</div>
              <div className="kpi-sub">trips verified</div>
            </div>
          </div>

          {/* Resolution Audit Trail */}
          {(resolvedExceptions.length > 0 || deferredUnassigned.length > 0) && (
            <div className="resolution-audit-card">
              <h4 className="audit-card-title">Resolution Audit Trail</h4>
              <div className="audit-items-list">
                {candidateView ? (
                  deferredUnassigned.map((u) => (
                    <div key={u.order?.id} className="audit-item-row" style={{ justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Check size={14} className="text-success" />
                        <span className="audit-ref">{u.order?.orderRef}</span>
                        <span className="audit-outlet">{u.order?.outletId}</span>
                        <span className="audit-note">Deferred: {u.reason || 'Reason recorded'}{u.nextDeliveryDate ? ` (Next: ${u.nextDeliveryDate})` : ''}</span>
                      </div>
                      <button
                        type="button"
                        className="toolbar-btn small"
                        disabled={actionPending}
                        onClick={() => void handleRestoreOrder(u.order?.id)}
                      >
                        <RotateCcw size={12} aria-hidden="true" />
                        <span>Restore</span>
                      </button>
                    </div>
                  ))
                ) : (
                  resolvedExceptions.map((ex) => (
                    <div key={ex.id} className="audit-item-row">
                      <Check size={14} className="text-success" />
                      <span className="audit-ref">{ex.ref}</span>
                      <span className="audit-outlet">{ex.outletName}</span>
                      <span className="audit-note">{ex.resolutionNote}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="celebration-actions">
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

  // 4A: Exceptions Triage View
  return (
    <div className="planning-step4-container animate-fade-in">
      {failure && (
        <div className="alert-card alert-danger" style={{ marginBottom: 'var(--space-16)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>Action Failed: </strong>
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

      {/* Decision Banner */}
      <div className="exceptions-banner">
        <div className="banner-left">
          <div className="banner-icon-box">
            <AlertTriangle size={24} className="text-warning-amber" />
          </div>
          <div>
            <div className="banner-title-row">
              <h2 className="banner-title">
                {openExceptions.length} exception{openExceptions.length === 1 ? '' : 's'} require{openExceptions.length === 1 ? 's' : ''} dispatcher decision
              </h2>
            </div>
            <p className="banner-subtitle">
              Review constraint conflicts and unassigned orders below. Defer unassigned orders with explicit reasons before publication.
            </p>
          </div>
        </div>
        <div className="banner-progress-box">
          <span className="banner-progress-label">
            {resolvedExceptions.length} of {activeExceptions.length} resolved
          </span>
          <div className="banner-progress-track">
            <div
              className="banner-progress-fill"
              style={{
                width: `${activeExceptions.length > 0 ? Math.round((resolvedExceptions.length / activeExceptions.length) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Category Filter Pills & Toggle */}
      <div className="step4-filter-toolbar">
        <div className="step4-pills">
          <button
            type="button"
            className={`filter-pill ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            <span>All</span>
            <span className="pill-badge">{activeExceptions.length}</span>
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategory === 'van' ? 'active' : ''}`}
            onClick={() => setActiveCategory('van')}
          >
            <span>Van Access</span>
            <span className="pill-badge">{activeExceptions.filter((e) => e.category === 'van').length}</span>
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategory === 'reefer' ? 'active' : ''}`}
            onClick={() => setActiveCategory('reefer')}
          >
            <span>Cold Chain</span>
            <span className="pill-badge">{activeExceptions.filter((e) => e.category === 'reefer').length}</span>
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategory === 'window' ? 'active' : ''}`}
            onClick={() => setActiveCategory('window')}
          >
            <span>Time Window</span>
            <span className="pill-badge">{activeExceptions.filter((e) => e.category === 'window').length}</span>
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategory === 'capacity' ? 'active' : ''}`}
            onClick={() => setActiveCategory('capacity')}
          >
            <span>Capacity</span>
            <span className="pill-badge">{activeExceptions.filter((e) => e.category === 'capacity').length}</span>
          </button>
        </div>

        <div className="step4-view-toggle">
          <button
            type="button"
            className={`toolbar-btn ${showResolved ? 'active' : ''}`}
            onClick={() => setShowResolved(!showResolved)}
          >
            <Eye size={14} aria-hidden="true" />
            <span>{showResolved ? 'Hide Resolved' : `Show Resolved (${resolvedExceptions.length})`}</span>
          </button>
        </div>
      </div>

      {/* Exception Triage Cards List */}
      <div className="exceptions-cards-list">
        {filteredExceptions.map((ex) => {
          const isResolved = ex.status === 'resolved'
          let rawOrderId: number | undefined
          if (candidateView) {
            const foundU = realUnassigned.find((u) => u.order?.orderRef === ex.ref || `Order #${u.order?.id}` === ex.ref)
            rawOrderId = foundU?.order?.id
          }

          return (
            <div key={ex.id} className={`triage-card ${isResolved ? 'triage-resolved' : ''}`}>
              <div className="triage-card-header">
                <div className="triage-header-left">
                  <span className="triage-ref">{ex.ref}</span>
                  <span className="triage-dot">·</span>
                  <span className="triage-outlet">{ex.outletName}</span>
                  <span className="triage-flag">{ex.flag}</span>
                </div>
                <div className="triage-header-right">
                  <span className="triage-window">🕒 {ex.window}</span>
                  <span className="triage-dot">·</span>
                  <span className="triage-vol">{ex.volume}</span>
                </div>
              </div>

              <div className="triage-card-body">
                <div className="triage-violation-row">
                  <AlertTriangle size={15} className="text-warning-amber" aria-hidden="true" />
                  <span className="triage-violation-title">{ex.violationTitle}:</span>
                  <span className="triage-violation-desc">{ex.violationDescription}</span>
                </div>

                {isResolved ? (
                  <div className="triage-resolved-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle size={15} className="text-success" aria-hidden="true" />
                      <span className="resolved-note">Resolved: {ex.resolutionNote}</span>
                    </div>
                    {candidateView && rawOrderId && (
                      <button
                        type="button"
                        className="toolbar-btn small"
                        disabled={actionPending}
                        onClick={() => void handleRestoreOrder(rawOrderId, ex.id)}
                      >
                        <RotateCcw size={12} aria-hidden="true" />
                        <span>Restore</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="triage-action-box">
                    <div className="suggested-fix-text">
                      <Sparkles size={14} className="text-brand-amber" aria-hidden="true" />
                      <span>{ex.suggestedFix}</span>
                    </div>

                    <div className="triage-buttons">
                      {!candidateView && ex.suggestedFix && (
                        <button
                          type="button"
                          className="btn-primary-yellow small"
                          onClick={() => handleMockQuickResolve(ex)}
                        >
                          <Check size={14} aria-hidden="true" />
                          <span>{ex.fixActionLabel ?? 'Apply Fix'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="toolbar-btn small"
                        disabled={actionPending}
                        onClick={() => handleOpenDeferModal(ex)}
                      >
                        <Clock size={14} aria-hidden="true" />
                        <span>Defer Order</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Defer Order Modal */}
      {deferModalOpen && deferTarget && (
        <div className="modal-overlay" onClick={() => setDeferModalOpen(false)}>
          <div className="modal-card animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Defer Order to Later Run</h3>
                <p className="modal-subtitle">
                  {deferTarget.ref} · {deferTarget.outletName} ({deferTarget.volume})
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDeferModalOpen(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <DeferDecisionFields idPrefix="exception-defer" value={deferDecision} onChange={setDeferDecision}
                fairness={deferTarget.orderId && candidateView?.fairness?.[String(deferTarget.orderId)]
                  ? [candidateView.fairness[String(deferTarget.orderId)]] : []}
                orderLabel={() => deferTarget.ref} />
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="toolbar-btn"
                disabled={actionPending}
                onClick={() => setDeferModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary-yellow"
                disabled={actionPending || !deferDecisionReady(deferDecision)}
                onClick={() => void handleConfirmDefer()}
              >
                {actionPending ? 'Saving...' : 'Confirm Deferral'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Bottom Bar */}
      <div className="planning-bottom-bar">
        <div className="bottom-bar-left">
          <div className="bottom-bar-metric">
            {openExceptions.length === 0 ? 'All exceptions resolved' : `${openExceptions.length} exception${openExceptions.length === 1 ? '' : 's'} remaining`}
          </div>
          <div className="bottom-bar-sub">
            {openExceptions.length === 0 ? 'Proceed to Confirm & Send' : 'Resolve all exceptions before sending dispatch'}
          </div>
        </div>
        <div className="bottom-bar-right">
          <button
            type="button"
            className="btn-generate-plan"
            disabled={openExceptions.length > 0}
            onClick={onContinueToConfirm}
          >
            <span>Continue to Confirm & Send</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
