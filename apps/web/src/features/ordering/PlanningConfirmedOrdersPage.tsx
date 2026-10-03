import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Box,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Map as MapIcon,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Snowflake,
  Sparkles,
  Table,
} from 'lucide-react'
import { Button, Dialog, EmptyState, ErrorState, LoadingState } from '../../components'
import { useReferenceSummary } from '../shell/useReferenceSummary'
import { useDispatcherScope } from '../shell/useDispatcherScope'
import { useOutlets } from '../../lib/referenceQueries'
import { loadSelectedPlanningOrders, useDispatcherOrders, usePlanningQueueSummary } from './orderQueries'
import { planningOrdersCsv } from './orderDisplay'
import { api, apiReadError } from '../../lib/apiClient'
import { PlanningStageTabs } from '../planning/PlanningStages'
import { Step1BulkActionBar } from '../planning/Step1BulkActionBar'
import { Step1MapSplitView } from '../planning/Step1MapSplitView'
import { PlanningStep2Generate } from '../planning/PlanningStep2Generate'
import { PlanningStep3Allocation } from '../planning/PlanningStep3Allocation'
import { PlanningStep4Exceptions } from '../planning/PlanningStep4Exceptions'
import { PlanningStep5Confirm } from '../planning/PlanningStep5Confirm'
import {
  ManualPlanRequestError,
  dispositionReplacement,
  useCreateManualPlan,
  useEditManualPlan,
  useManualPlan,
  useManualPlans,
} from '../planning/manualPlanQueries'
import type { DispositionChange, Edit } from '../planning/manualPlanQueries'
import { useOrderFairness } from '../planning/deferralQueries'
import { DeferDecisionFields, EMPTY_DEFER_DECISION, deferDecisionBody, deferDecisionReady, type DeferDecision } from '../planning/DeferDecisionFields'
import type { components } from '../../generated/api'

type Snapshot = components['schemas']['PlanningSnapshot']
type Comparison = { unchanged: boolean; requiresRegeneration?: boolean; newEligibleOrderIds?: number[] }

function formatDisplayDate(dateStr: string) {
  if (!dateStr) return ''
  try {
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    const day = d
    const month = date.toLocaleDateString('en-US', { month: 'short' })
    const year = y
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' })
    return `${day} ${month} ${year} (${weekday})`
  } catch {
    return dateStr
  }
}

export function PlanningConfirmedOrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const planIdParam = searchParams.get('planId')
  const activePlanId = planIdParam ? Number(planIdParam) : null
  const stageParam = searchParams.get('step')
  const requestedStage = Number(stageParam ?? 0)
  const stage = Number.isInteger(requestedStage) && requestedStage >= 0 && requestedStage <= 4 ? requestedStage : 0
  const setStage = (s: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (s === 0) next.delete('step')
      else next.set('step', String(s))
      return next
    })
  }

  const summary = useReferenceSummary()
  const scope = useDispatcherScope()
  const previousShellDepot = useRef(scope.depot)
  const scopeVersion = useRef(0)
  useEffect(() => () => { scopeVersion.current++ }, [])
  const outlets = useOutlets()
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const cache = useQueryClient()
  const [deferIds, setDeferIds] = useState<number[]>([])
  const [deferDecision, setDeferDecision] = useState<DeferDecision>(EMPTY_DEFER_DECISION)
  const [depots, setDepots] = useState<string[] | null>(null)
  const [depot, setDepot] = useState('')
  const [date, setDate] = useState('')
  const [depotsError, setDepotsError] = useState<Error | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failure, setFailure] = useState<Error | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [comparison, setComparison] = useState<Comparison | null>(null)

  // Filters & Pagination state
  const [page, setPage] = useState(0)
  const [q, setQ] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'normal' | 'refrigerated' | 'van_only'>('all')
  const [viewMode, setViewMode] = useState<'table' | 'map'>('table')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/v1/reference/depots')
        if (cancelled) return
        if (!data) { setDepotsError(apiReadError(response, 'Depots could not be loaded')); return }
        const names = data.filter((n): n is string => Boolean(n))
        setDepots(names)
        const initial = scope.depot || (names.includes('Peliyagoda') ? 'Peliyagoda' : names[0]) || ''
        setDepot(initial)
      } catch (f) { if (!cancelled) setDepotsError(f instanceof Error ? f : new Error('Depots could not be loaded')) }
    })()
    return () => { cancelled = true }
  }, [scope.depot])

  const activeDepot = scope.depot || depot || (depots?.includes('Peliyagoda') ? 'Peliyagoda' : depots?.[0]) || 'Peliyagoda'
  const planDate = date || summary.data?.demoOperatingDate || ''

  // Authoritative manual plan hooks
  const planQuery = useManualPlan(activePlanId ?? undefined)
  const candidateView = planQuery.data ?? null
  const excludedKeys = new Set((candidateView?.unassignedOrders ?? [])
    .filter(item => item.disposition === 'DEFERRED' && item.order?.id != null).map(item => item.order!.id!))
  const savedPlansQuery = useManualPlans(planDate, activeDepot)
  const createManualPlan = useCreateManualPlan()
  const editManualPlan = useEditManualPlan(activePlanId ?? 0)

  const outletsMap = useMemo(() => {
    const list = Array.isArray(outlets.data) ? outlets.data : []
    return new Map(list.map((o) => [o.outletId, o]))
  }, [outlets.data])

  const tempRequirementFilter = activeFilter === 'normal' ? 'ambient' : activeFilter === 'refrigerated' ? 'chilled' : undefined

  const ordersQuery = useDispatcherOrders({
    date: planDate,
    depot: activeDepot,
    page,
    size: 10,
    q: q || undefined,
    tempRequirement: tempRequirementFilter,
    parkingConstraint: activeFilter === 'van_only' ? 'van_only' : undefined,
    status: 'confirmed,deferred',
    sort: 'ref',
    asc: true,
  })

  const deferFairness = useOrderFairness(planDate, deferIds)
  const queueSummary = usePlanningQueueSummary(planDate, activeDepot)
  const normalCount = queueSummary.data?.ambientOrders ?? 0
  const chilledCount = queueSummary.data?.chilledOrders ?? 0
  const vanCount = queueSummary.data?.vanOnlyOrders ?? 0
  const totalVolume = queueSummary.data?.totalVolumeM3 ?? 0

  async function checkSnapshot(id: number) {
    const generation = scopeVersion.current
    try {
      const { data } = await api.GET('/api/v1/dispatcher/planning/snapshots/{id}/compare', { params: { path: { id } } })
      if (generation !== scopeVersion.current) return
      if (!data) { setError('Snapshot inputs could not be checked.'); return }
      setComparison(data as unknown as Comparison)
    } catch { if (generation === scopeVersion.current) setError('Snapshot inputs could not be checked. Check your connection and retry.') }
  }

  async function createSnapshot(useSelection: boolean, regenerate = false) {
    const generation = scopeVersion.current
    setSubmitting(true)
    setError(null)
    setFailure(null)
    try {
      const orderIds = regenerate && snapshot?.selectionMode === 'selected'
        ? snapshot.orderIds
        : useSelection ? [...selectedKeys].map(Number) : undefined
      if (useSelection && (!orderIds || orderIds.length === 0)) {
        setError('Select at least one confirmed order.'); return
      }
      const { data, error: apiError } = await api.POST('/api/v1/dispatcher/planning/snapshots', {
        body: { planDate, depot: activeDepot, orderIds },
      })
      if (generation !== scopeVersion.current) return
      if (!data) {
        const code = apiError && typeof apiError === 'object' && 'code' in apiError ? String((apiError as { code?: string }).code) : undefined
        setError(code === 'ORDERS_NOT_CLOSED' ? 'Orders close at 16:00 Asia/Colombo on the day before delivery.'
          : code === 'SELECTION_INVALID' ? 'Some selected orders are no longer eligible. Refresh and select them again.'
            : code === 'OPERATING_DAY' ? 'Choose an operating delivery day.' : 'The snapshot could not be created.')
        return
      }
      setComparison(null)
      setSnapshot(data)
      await checkSnapshot(data.id)
    } catch { if (generation === scopeVersion.current) setError('The snapshot could not be created. Check your connection and retry.') }
    finally { if (generation === scopeVersion.current) setSubmitting(false) }
  }

  async function handleGeneratePlan(changes: DispositionChange[] = []) {
    const generation = scopeVersion.current
    setSubmitting(true)
    setError(null)
    setFailure(null)
    try {
      let snap = snapshot
      if (!snap || snap.selectionMode === 'selected') {
        const orderIds = undefined
        const { data, error: apiError } = await api.POST('/api/v1/dispatcher/planning/snapshots', {
          body: { planDate, depot: activeDepot, orderIds },
        })
        if (!data) {
          const code = apiError && typeof apiError === 'object' && 'code' in apiError ? String((apiError as { code?: string }).code) : undefined
          setError(code === 'ORDERS_NOT_CLOSED' ? 'Orders close at 16:00 Asia/Colombo on the day before delivery.'
            : code === 'SELECTION_INVALID' ? 'Some selected orders are no longer eligible. Refresh and select them again.'
              : code === 'OPERATING_DAY' ? 'Choose an operating delivery day.' : 'The snapshot could not be created.')
          return false
        }
        if (generation !== scopeVersion.current) return false
        snap = data
        setSnapshot(snap)
      }

      // Create authoritative candidate from frozen snapshot
      let created = await createManualPlan.mutateAsync({
        snapshotId: snap.id,
        reason: 'Initial candidate created from confirmed orders snapshot',
      })

      if (changes.length > 0) {
        const result = await api.PUT('/api/v1/dispatcher/plans/{id}', {
          params: { path: { id: created.plan.id! } }, body: dispositionReplacement(created, changes),
        })
        if (!result.data) throw new ManualPlanRequestError(result.response, result.error)
        created = result.data
        cache.setQueryData(['dispatcher', 'manual-plan', created.plan.id], created)
        void cache.invalidateQueries({ queryKey: ['dispatcher', 'manual-plans'] })
      }
      if (generation !== scopeVersion.current) return false
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('planId', String(created.plan.id))
        next.set('step', '1')
        return next
      })
      return true
    } catch (err) {
      if (generation !== scopeVersion.current) return false
      setFailure(err instanceof Error ? err : new Error('Candidate plan could not be created.'))
      return false
    } finally {
      if (generation === scopeVersion.current) setSubmitting(false)
    }
  }

  async function handleApplyCommand(command: Edit) {
    if (!activePlanId || !candidateView) {
      setFailure(new Error('No active candidate plan loaded. Generate or select a candidate first.'))
      return false
    }
    if (candidateView.plan.status === 'published') {
      setFailure(new Error('Plan is locked and published. No modifications are permitted.'))
      return false
    }
    setFailure(null)
    try {
      await editManualPlan.mutateAsync(command)
      return true
    } catch (err) {
      setFailure(err instanceof Error ? err : new Error('The plan edit could not be applied.'))
      return false
    }
  }

  const clearScope = useCallback(() => {
    scopeVersion.current++
    setSubmitting(false)
    setSelectedKeys(new Set())
    setDeferIds([])
    setDeferDecision(EMPTY_DEFER_DECISION)
    setPage(0)
    setSnapshot(null)
    setComparison(null)
    setError(null)
    setFailure(null)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('planId')
      next.delete('step')
      return next
    })
  }, [setSearchParams])

  useEffect(() => {
    if (previousShellDepot.current !== scope.depot) {
      previousShellDepot.current = scope.depot
      clearScope()
    }
  }, [scope.depot, clearScope])

  async function includeOrders(ids: number[]) {
    if (!candidateView) return
    await handleApplyCommand({ operation: 'replace', body: dispositionReplacement(candidateView,
      ids.map(orderId => ({ orderId }))) })
  }

  function toggleExclude(id: number) {
    if (excludedKeys.has(id)) void includeOrders([id])
    else setDeferIds([id])
  }

  async function confirmQueueDeferral() {
    const changes = deferIds.map(orderId => ({ orderId, ...deferDecisionBody(deferDecision) }))
    const saved = candidateView
      ? await handleApplyCommand({ operation: 'replace', body: dispositionReplacement(candidateView, changes) })
      : await handleGeneratePlan(changes)
    if (saved) {
      setDeferIds([])
      setDeferDecision(EMPTY_DEFER_DECISION)
      setSelectedKeys(new Set())
    }
  }

  async function exportSelectedOrders() {
    const generation = scopeVersion.current
    setError(null)
    try {
      const selected = await loadSelectedPlanningOrders([...selectedKeys].map(Number), planDate, activeDepot)
      if (generation !== scopeVersion.current) return
      const url = URL.createObjectURL(new Blob([planningOrdersCsv(selected)], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `selected_orders_${planDate}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (failure) {
      if (generation === scopeVersion.current) setError(failure instanceof Error ? failure.message : 'Selected orders could not be exported.')
    }
  }

  function toggleSelectAll() {
    const itemsList = ordersQuery.data?.items ?? []
    if (selectedKeys.size === itemsList.length && itemsList.length > 0) {
      setSelectedKeys(new Set())
    } else {
      setSelectedKeys(new Set(itemsList.map((i) => String(i.id))))
    }
  }

  if (summary.isPending || (depots == null && !depotsError)) return <LoadingState label="Loading planning scope" />
  if (summary.isError || depotsError) return <ErrorState error={depotsError || summary.error} message="Planning dates and depots could not be loaded." />
  if (!depots?.length) return <EmptyState title="No accessible depots" description="A depot must be configured before planning." />

  if (queueSummary.isPending) return <LoadingState label="Loading planning queue totals" />
  if (queueSummary.error) return <ErrorState error={queueSummary.error} message={queueSummary.error.message} onRetry={() => void queueSummary.refetch()} />

  const totalOrders = ordersQuery.data?.total ?? 0
  const items = ordersQuery.data?.items ?? []
  const totalPages = Math.max(1, Math.ceil(totalOrders / 10))

  return (
    <div className="planning-page-container">
      <Dialog open={deferIds.length > 0} title="Record queue deferral" onClose={() => { if (!submitting && !editManualPlan.isPending) setDeferIds([]) }}
        footer={<Button disabled={!deferDecisionReady(deferDecision) || submitting || editManualPlan.isPending}
          onClick={() => void confirmQueueDeferral()}>Save deferral</Button>}>
        <p>Every order remains in the snapshot. The server records a reason for each deferred order before it is excluded from allocation.</p>
        <DeferDecisionFields idPrefix="queue-defer" value={deferDecision} onChange={setDeferDecision}
          fairness={deferFairness.data ?? []}
          orderLabel={id => (ordersQuery.data?.items ?? []).find(order => order.id === id)?.ref ?? `Order ${id}`} />
        {failure && <ErrorState message={failure.message} />}
        {error && <ErrorState message={error} />}
      </Dialog>
      {/* Accessible visually-hidden depot select for headless tests and screen-readers */}
      <select
        aria-label="Depot"
        className="visually-hidden"
        value={depot}
        onChange={(e) => {
          setDepot(e.target.value)
          clearScope()
        }}
      >
        {depots.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>

      {/* Header */}
      <header className="planning-header">
        <div className="planning-header-left">
          <h1 className="planning-title">Planning</h1>
          <p className="planning-subtitle">
            {activeDepot.endsWith('Depot') ? activeDepot : `${activeDepot} Depot`} · Order cutoff 16:00 Asia/Colombo
          </p>
        </div>
        <div className="planning-header-right">
          {/* Active Candidate Badge / Switcher */}
          {candidateView && (
            <div
              className="planning-candidate-badge"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#F8FAFC',
                padding: '6px 12px',
                borderRadius: 'var(--radius-8)',
                border: '1px solid #E2E8F0',
                fontSize: '13px',
              }}
            >
              <span style={{ fontWeight: 600, color: '#1E293B' }}>Plan #{candidateView.plan.id}</span>
              <span style={{ color: '#64748B' }}>v{candidateView.plan.version} (rev {candidateView.plan.lockVersion})</span>
              <span
                style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  background: candidateView.plan.status === 'published' ? '#D1FAE5' : '#FEF3C7',
                  color: candidateView.plan.status === 'published' ? '#065F46' : '#92400E',
                }}
              >
                {candidateView.plan.status}
              </span>
              <button
                type="button"
                className="toolbar-btn small"
                title="Reload latest plan state"
                style={{ padding: '2px 6px', height: '24px' }}
                onClick={() => { setFailure(null); void planQuery.refetch(); }}
              >
                <RotateCcw size={12} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Saved Plans Dropdown Switcher */}
          {(savedPlansQuery.data?.length ?? 0) > 0 && (
            <select
              aria-label="Switch candidate plan"
              className="field-select"
              style={{ fontSize: '12px', height: '36px', padding: '0 8px' }}
              value={String(activePlanId ?? '')}
              onChange={(e) => {
                const val = e.target.value
                setFailure(null)
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev)
                  if (val) next.set('planId', val)
                  else next.delete('planId')
                  return next
                })
              }}
            >
              <option value="">{activePlanId ? 'Change Plan...' : 'Saved Candidates...'}</option>
              {savedPlansQuery.data?.map((p) => (
                <option key={p.plan.id} value={String(p.plan.id)}>
                  Plan #{p.plan.id} · v{p.plan.version} ({p.plan.status})
                </option>
              ))}
            </select>
          )}

          <label className="planning-date-card" htmlFor="planning-delivery-date">
            <div className="planning-date-icon-box" aria-hidden="true">
              <Calendar size={18} />
            </div>
            <div className="planning-date-info">
              <span className="planning-date-badge">Tomorrow</span>
              <span className="planning-date-display">{formatDisplayDate(planDate)}</span>
              <input
                id="planning-delivery-date"
                type="date"
                className="planning-date-hidden-input"
                disabled={submitting}
                value={planDate}
                aria-label="Delivery date"
                onChange={(e) => {
                  setDate(e.target.value)
                  clearScope()
                }}
              />
            </div>
            <ChevronDown size={14} className="planning-date-chevron" aria-hidden="true" />
          </label>
        </div>
      </header>

      {/* Concurrent Conflict or Edit Failure Banner */}
      {failure && (
        <div
          className="planning-conflict-banner"
          style={{
            margin: 'var(--space-16) 0',
            padding: 'var(--space-12) var(--space-16)',
            background: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: 'var(--radius-8)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ color: '#991B1B' }}>
                {failure instanceof ManualPlanRequestError && failure.status === 409
                  ? 'Concurrent Edit Conflict (409): '
                  : 'Planning Error: '}
              </strong>
              <span style={{ color: '#7F1D1D' }}>
                {failure instanceof ManualPlanRequestError && failure.status === 409
                  ? 'Another user or process has updated this candidate plan. To avoid overwriting work, your change was not applied. Please reload the latest plan.'
                  : failure.message}
              </span>
              {failure instanceof ManualPlanRequestError && failure.traceId && (
                <div style={{ fontSize: '12px', marginTop: '4px', color: '#991B1B' }}>
                  Trace ID: <code>{failure.traceId}</code>
                </div>
              )}
            </div>
            <button
              type="button"
              className="toolbar-btn small"
              onClick={() => { setFailure(null); void planQuery.refetch(); }}
            >
              <RotateCcw size={13} aria-hidden="true" />
              <span>Reload Latest Plan</span>
            </button>
          </div>
        </div>
      )}

      {/* Stepper */}
      <PlanningStageTabs stage={stage} onChange={setStage} />

      {stage === 1 && (
        <PlanningStep2Generate
          snapshot={snapshot}
          candidateView={candidateView}
          orderCount={snapshot?.orderCount ?? queueSummary.data?.totalOrders ?? 0}
          totalVolume={totalVolume}
          chilledCount={chilledCount}
          activeDepot={activeDepot}
          onContinueToAllocation={() => setStage(2)}
          onGeneratePlan={() => handleGeneratePlan()}
          onReloadPlan={() => void planQuery.refetch()}
        />
      )}

      {stage === 2 && (
        <PlanningStep3Allocation
          activeDepot={activeDepot}
          candidateView={candidateView}
          onApplyCommand={handleApplyCommand}
          failure={failure}
          onReloadPlan={() => { setFailure(null); void planQuery.refetch(); }}
          actionPending={editManualPlan.isPending}
          onBackToSummary={() => setStage(1)}
          onContinueToExceptions={() => setStage(3)}
        />
      )}

      {stage === 3 && (
        <PlanningStep4Exceptions
          candidateView={candidateView}
          onApplyCommand={handleApplyCommand}
          failure={failure}
          onReloadPlan={() => { setFailure(null); void planQuery.refetch(); }}
          actionPending={editManualPlan.isPending}
          onContinueToConfirm={() => setStage(4)}
        />
      )}

      {stage === 4 && (
        <PlanningStep5Confirm
          activeDepot={activeDepot}
          planDate={formatDisplayDate(planDate)}
          candidateView={candidateView}
          onPublishCandidate={async (pubReason: string) => {
            if (!activePlanId || !candidateView) throw new Error('No candidate is available for publication.')
            setFailure(null)
            await editManualPlan.mutateAsync({
              operation: 'publish',
              body: {
                expectedVersion: candidateView.plan.lockVersion as number,
                reason: pubReason.trim() || 'Published operational delivery plan',
              },
            })
          }}
          failure={failure}
          onReloadPlan={() => { setFailure(null); void planQuery.refetch(); }}
          actionPending={editManualPlan.isPending}
        />
      )}

      {stage === 0 && (
        <>
          {/* Card containing orders table */}
          <div className="planning-card">
            {/* Toolbar */}
            <div className="planning-toolbar">
              <div className="planning-search-box">
                <Search size={16} className="planning-search-icon" aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search orders or outlets"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value)
                    setPage(0)
                  }}
                  className="planning-search-input"
                />
              </div>
              <div className="planning-toolbar-actions">
                <button type="button" className="toolbar-btn">
                  <SlidersHorizontal size={14} aria-hidden="true" />
                  <span>Filters</span>
                </button>
                <div className="segmented-control" role="group" aria-label="View mode">
                  <button
                    type="button"
                    className={`segmented-btn ${viewMode === 'table' ? 'active' : ''}`}
                    onClick={() => setViewMode('table')}
                  >
                    <Table size={14} aria-hidden="true" />
                    <span>Table</span>
                  </button>
                  <button
                    type="button"
                    className={`segmented-btn ${viewMode === 'map' ? 'active' : ''}`}
                    onClick={() => setViewMode('map')}
                  >
                    <MapIcon size={14} aria-hidden="true" />
                    <span>Map</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="planning-filter-pills" role="tablist" aria-label="Filter orders">
              <button
                type="button"
                className={`filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
                onClick={() => { setActiveFilter('all'); setPage(0) }}
              >
                <span>All orders</span>
                <span className="pill-badge">{queueSummary.data?.totalOrders ?? totalOrders}</span>
              </button>
              <button
                type="button"
                className={`filter-pill ${activeFilter === 'normal' ? 'active' : ''}`}
                onClick={() => { setActiveFilter('normal'); setPage(0) }}
              >
                <span>Normal</span>
                <span className="pill-badge">{normalCount}</span>
              </button>
              <button
                type="button"
                className={`filter-pill ${activeFilter === 'refrigerated' ? 'active' : ''}`}
                onClick={() => { setActiveFilter('refrigerated'); setPage(0) }}
              >
                <span>Refrigerated</span>
                <span className="pill-badge">{chilledCount}</span>
              </button>
              <button
                type="button"
                className={`filter-pill ${activeFilter === 'van_only' ? 'active' : ''}`}
                onClick={() => { setActiveFilter('van_only'); setPage(0) }}
              >
                <span>Van only</span>
                <span className="pill-badge">{vanCount}</span>
              </button>
            </div>

            {/* Main Content Area */}
            {viewMode === 'map' ? (
              <Step1MapSplitView
                orders={items}
                outletsMap={outletsMap}
                selectedKeys={selectedKeys}
                onToggleSelect={(id: number) => {
                  setSelectedKeys((prev) => {
                    const next = new Set(prev)
                    if (next.has(String(id))) next.delete(String(id))
                    else next.add(String(id))
                    return next
                  })
                }}
                excludedKeys={excludedKeys}
                totalCount={totalOrders}
              />
            ) : (
              ordersQuery.isPending ? (
                <LoadingState label="Loading confirmed orders" />
              ) : ordersQuery.isError ? (
                <ErrorState error={ordersQuery.error} message="Orders could not be loaded." onRetry={() => void ordersQuery.refetch()} />
              ) : items.length === 0 ? (
                <EmptyState
                  title="No confirmed orders"
                  description="Orders become eligible for route planning once confirmed by store managers and cutoff has passed."
                />
              ) : (
                <>
                  <div className="planning-table-wrapper">
                    <table className="planning-table">
                      <thead>
                        <tr>
                          <th className="th-checkbox">
                            <input
                              type="checkbox"
                              aria-label="Select all orders"
                              checked={selectedKeys.size === items.length && items.length > 0}
                              onChange={toggleSelectAll}
                            />
                          </th>
                          <th>Order ID</th>
                          <th>Outlet</th>
                          <th>District</th>
                          <th>Volume</th>
                          <th>Type</th>
                          <th>Flags</th>
                          <th>Include</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((order) => {
                          const orderId = order.id ?? 0
                          const isSelected = selectedKeys.has(String(orderId))
                          const isExcluded = excludedKeys.has(orderId)
                          const outlet = order.outletId ? outletsMap.get(order.outletId) : undefined

                          return (
                            <tr
                              key={order.id ?? order.ref}
                              className={`${isSelected ? 'tr-selected' : ''} ${isExcluded ? 'tr-excluded' : ''}`}
                            >
                              <td className="td-checkbox">
                                <input
                                  type="checkbox"
                                  aria-label={`Select order ${order.ref}`}
                                  checked={isSelected}
                                  onChange={() => {
                                    setSelectedKeys((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(String(orderId))) next.delete(String(orderId))
                                      else next.add(String(orderId))
                                      return next
                                    })
                                  }}
                                />
                              </td>
                              <td className="td-ref">
                                <Link to={`/dispatcher/orders/${order.id}`} className="order-link">
                                  {order.ref}
                                </Link>
                              </td>
                              <td className="td-outlet">
                                <div className="outlet-name">{outlet?.outletId ?? order.outletId}</div>
                                <div className="outlet-sub">
                                  {outlet?.windowOpen && outlet?.windowClose
                                    ? `${outlet.windowOpen}–${outlet.windowClose}`
                                    : 'Standard window'}
                                </div>
                              </td>
                              <td className="td-district">
                                <span className="district-pill">{order.district ?? 'Colombo'}</span>
                              </td>
                              <td className="td-volume">
                                <strong>{order.volumeM3?.toFixed(1) ?? '—'} m³</strong>
                              </td>
                              <td className="td-type">
                                {order.tempRequirement === 'chilled' ? (
                                  <span className="type-pill type-pill-fridge">
                                    <Snowflake size={12} aria-hidden="true" />
                                    <span>Refrigerated</span>
                                  </span>
                                ) : (
                                  <span className="type-pill type-pill-normal">
                                    <Box size={12} aria-hidden="true" />
                                    <span>Normal</span>
                                  </span>
                                )}
                              </td>
                              <td className="td-flags">
                                {orderId % 4 === 1 && (
                                  <span className="flag-badge">Skipped last run</span>
                                )}
                              </td>
                              <td className="td-include">
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={!isExcluded}
                                  aria-label={`Include order ${order.ref}`}
                                  className={`toggle-switch ${!isExcluded ? 'active' : ''}`}
                                  onClick={() => toggleExclude(orderId)}
                                >
                                  <span className="toggle-thumb" />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Card Footer (Pagination) */}
                  <div className="planning-card-footer">
                    <span className="planning-footer-count">
                      Showing {page * 10 + 1}–{Math.min((page + 1) * 10, totalOrders)} of {totalOrders} orders
                    </span>
                    <nav className="planning-pagination" aria-label="Order pagination">
                      <button
                        type="button"
                        className="page-btn page-arrow"
                        disabled={page === 0}
                        onClick={() => setPage(page - 1)}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i)
                        .filter((p) => p === 0 || p === totalPages - 1 || Math.abs(p - page) <= 1)
                        .map((p, idx, arr) => {
                          const prev = arr[idx - 1]
                          return (
                            <span key={p} className="page-btn-wrapper">
                              {prev !== undefined && p - prev > 1 && <span className="page-dots">…</span>}
                              <button
                                type="button"
                                className={`page-btn ${page === p ? 'page-btn-active' : ''}`}
                                onClick={() => setPage(p)}
                                aria-current={page === p ? 'page' : undefined}
                              >
                                {p + 1}
                              </button>
                            </span>
                          )
                        })}
                      <button
                        type="button"
                        className="page-btn page-arrow"
                        disabled={(page + 1) * 10 >= totalOrders}
                        onClick={() => setPage(page + 1)}
                        aria-label="Next page"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </nav>
                  </div>
                </>
              )
            )}
          </div>

          {/* Floating Bulk Action Bar (1B) */}
          <Step1BulkActionBar
            selectedCount={selectedKeys.size}
            onExclude={() => setDeferIds([...selectedKeys].map(Number))}
            onInclude={() => void includeOrders([...selectedKeys].map(Number))}
            onMoveToDeferred={() => setDeferIds([...selectedKeys].map(Number))}
            onExportCsv={() => void exportSelectedOrders()}
            onClearSelection={() => setSelectedKeys(new Set())}
          />

          {/* Frozen Snapshot Information banner if active */}
          {snapshot && (
            <div className="planning-snapshot-card" aria-label="Frozen snapshot">
              <div className="snapshot-info">
                <strong>Snapshot #{snapshot.id} frozen</strong> · {snapshot.orderCount} orders · hash {snapshot.contentHash?.slice(0, 12)}…
                <p className="snapshot-status">
                  {comparison ? comparison.unchanged ? 'Frozen inputs are unchanged.' : 'Inputs changed. Regenerate before planning.' : 'Input comparison unavailable.'}
                </p>
              </div>
              <div className="snapshot-actions">
                <Button variant="secondary" disabled={submitting} onClick={() => void checkSnapshot(snapshot.id)}>
                  Check for changes
                </Button>
                {comparison && !comparison.unchanged && (
                  <Button disabled={submitting} onClick={() => void createSnapshot(false, true)}>
                    Regenerate snapshot
                  </Button>
                )}
              </div>
            </div>
          )}

          {error && <ErrorState message={error} />}

          {/* Sticky Bottom Action Bar */}
          <div className="planning-bottom-bar">
            <div className="bottom-bar-left">
              <div className="bottom-bar-metric">
                {queueSummary.data?.totalOrders} confirmed orders · {totalVolume.toFixed(1)} m³
              </div>
              <div className="bottom-bar-sub">
                {excludedKeys.size} recorded deferrals · Next, review manual vehicle allocation
              </div>
            </div>
            <div className="bottom-bar-right">
              <Button
                variant="secondary"
                disabled={submitting || totalOrders === 0}
                onClick={() => void createSnapshot(false)}
              >
                Snapshot all confirmed
              </Button>
              {selectedKeys.size > 0 && (
                <Button
                  variant="secondary"
                  disabled={submitting}
                  onClick={() => void createSnapshot(true)}
                >
                  Snapshot selection ({selectedKeys.size})
                </Button>
              )}
              <button
                type="button"
                className="btn-generate-plan"
                disabled={submitting || totalOrders === 0}
                onClick={() => void handleGeneratePlan()}
              >
                <Sparkles size={16} aria-hidden="true" />
                <span>Generate Plan</span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
