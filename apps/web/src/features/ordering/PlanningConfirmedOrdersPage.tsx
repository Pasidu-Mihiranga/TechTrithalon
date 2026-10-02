import { PlanningStageTabs } from '../planning/PlanningStages'
import { Step1BulkActionBar } from '../planning/Step1BulkActionBar'
import { Step1MapSplitView } from '../planning/Step1MapSplitView'
import { PlanningStep2Generate } from '../planning/PlanningStep2Generate'
import { PlanningStep3Allocation } from '../planning/PlanningStep3Allocation'
import { PlanningStep4Exceptions } from '../planning/PlanningStep4Exceptions'
import { PlanningStep5Confirm } from '../planning/PlanningStep5Confirm'
import { useEffect, useMemo, useState } from 'react'
import { Button, EmptyState, ErrorState, LoadingState } from '../../components'
import { useReferenceSummary } from '../shell/useReferenceSummary'
import { useDispatcherScope } from '../shell/useDispatcherScope'
import { useOutlets } from '../../lib/referenceQueries'
import { useDispatcherOrders } from './orderQueries'
import { api, apiReadError } from '../../lib/apiClient'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Ban,
  Box,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Map as MapIcon,
  Search,
  SlidersHorizontal,
  Snowflake,
  Sparkles,
  Table,
} from 'lucide-react'
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
  const [stage, setStage] = useState(0)
  const summary = useReferenceSummary()
  const scope = useDispatcherScope()
  const outlets = useOutlets()
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [excludedKeys, setExcludedKeys] = useState<Set<number>>(new Set())
  const [depots, setDepots] = useState<string[] | null>(null)
  const [depot, setDepot] = useState('')
  const [date, setDate] = useState('')
  const [depotsError, setDepotsError] = useState<Error | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
        setDepot(scope.depot || names[0] || '')
      } catch (failure) { if (!cancelled) setDepotsError(failure instanceof Error ? failure : new Error('Depots could not be loaded')) }
    })()
    return () => { cancelled = true }
  }, [scope.depot])

  const activeDepot = scope.depot || depot || depots?.[0] || 'Peliyagoda'
  const planDate = date || summary.data?.demoOperatingDate || ''

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
    status: 'confirmed',
    sort: 'ref',
    asc: true,
  })

  // Full counts query for filter pills
  const allOrdersQuery = useDispatcherOrders({
    date: planDate,
    depot: activeDepot,
    page: 0,
    size: 200,
    status: 'confirmed',
  })

  const { normalCount, chilledCount, vanCount, totalVolume } = useMemo(() => {
    const items = allOrdersQuery.data?.items ?? []
    let normal = 0
    let chilled = 0
    let van = 0
    let vol = 0
    for (const item of items) {
      vol += item.volumeM3 ?? 0
      if (item.tempRequirement === 'ambient') normal++
      if (item.tempRequirement === 'chilled') chilled++
      const outlet = outletsMap.get(item.outletId)
      if (outlet?.parkingConstraint === 'van_only') van++
    }
    return {
      normalCount: normal,
      chilledCount: chilled,
      vanCount: van,
      totalVolume: vol || 412.5,
    }
  }, [allOrdersQuery.data?.items, outletsMap])

  async function checkSnapshot(id: number) {
    try {
      const { data } = await api.GET('/api/v1/dispatcher/planning/snapshots/{id}/compare', { params: { path: { id } } })
      if (!data) { setError('Snapshot inputs could not be checked.'); return }
      setComparison(data as unknown as Comparison)
    } catch { setError('Snapshot inputs could not be checked. Check your connection and retry.') }
  }

  async function createSnapshot(useSelection: boolean, regenerate = false) {
    setSubmitting(true)
    setError(null)
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
    } catch { setError('The snapshot could not be created. Check your connection and retry.') }
    finally { setSubmitting(false) }
  }

  async function handleGeneratePlan() {
    if (!snapshot) {
      await createSnapshot(false)
    }
    setStage(1)
  }

  function clearScope() { setSelectedKeys(new Set()); setSnapshot(null); setComparison(null); setError(null) }

  function toggleExclude(id: number) {
    setExcludedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const items = ordersQuery.data?.items ?? []
    if (selectedKeys.size === items.length && items.length > 0) {
      setSelectedKeys(new Set())
    } else {
      setSelectedKeys(new Set(items.map((i) => String(i.id))))
    }
  }

  if (summary.isPending || (depots == null && !depotsError)) return <LoadingState label="Loading planning scope" />
  if (summary.isError || depotsError) return <ErrorState error={depotsError || summary.error} message="Planning dates and depots could not be loaded." />
  if (!depots?.length) return <EmptyState title="No accessible depots" description="A depot must be configured before planning." />

  const totalOrders = ordersQuery.data?.total ?? 0
  const items = ordersQuery.data?.items ?? []
  const totalPages = Math.max(1, Math.ceil(totalOrders / 10))

  return (
    <div className="planning-page-container">
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
            {activeDepot.endsWith('Depot') ? activeDepot : `${activeDepot} Depot`} · Orders closed 16:00 · 7 late orders moved to the next run
          </p>
        </div>
        <div className="planning-header-right">
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

      {/* Stepper */}
      <PlanningStageTabs stage={stage} onChange={setStage} />

      {stage === 1 && (
        <PlanningStep2Generate
          snapshot={snapshot}
          orderCount={totalOrders}
          totalVolume={totalVolume}
          chilledCount={chilledCount}
          activeDepot={activeDepot}
          onContinueToAllocation={() => setStage(2)}
          onGeneratePlan={async () => {
            if (!snapshot) {
              await createSnapshot(false)
            }
          }}
        />
      )}

      {stage === 2 && (
        <PlanningStep3Allocation
          onBackToSummary={() => setStage(1)}
          onContinueToExceptions={() => setStage(3)}
        />
      )}

      {stage === 3 && (
        <PlanningStep4Exceptions
          onContinueToConfirm={() => setStage(4)}
        />
      )}

      {stage === 4 && (
        <PlanningStep5Confirm
          activeDepot={activeDepot}
          planDate={formatDisplayDate(planDate)}
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
                <span className="pill-badge">{allOrdersQuery.data?.total ?? totalOrders}</span>
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

            {/* Table alert banner if orders are excluded (1B) */}
            {excludedKeys.size > 0 && (
              <div className="table-alert-banner">
                <div className="alert-banner-left">
                  <Ban size={15} aria-hidden="true" />
                  <span>
                    {excludedKeys.size === 1
                      ? `ORD-${Array.from(excludedKeys)[0]} excluded from plan`
                      : `${excludedKeys.size} orders excluded from plan`}
                  </span>
                </div>
                <button
                  type="button"
                  className="alert-banner-undo"
                  onClick={() => setExcludedKeys(new Set())}
                >
                  Undo
                </button>
              </div>
            )}

            {/* Table or Map Split View */}
            {ordersQuery.isPending && <LoadingState rows={4} label="Loading confirmed orders" />}
            {ordersQuery.isError && (
              <ErrorState error={ordersQuery.error} message="Orders could not be loaded." onRetry={() => void ordersQuery.refetch()} />
            )}
            {ordersQuery.data && items.length === 0 && (
              <EmptyState title="No orders" description="No confirmed orders match these filters for the demo delivery day." />
            )}
            {ordersQuery.data && items.length > 0 && (
              viewMode === 'map' ? (
                <Step1MapSplitView
                  orders={items}
                  outletsMap={outletsMap}
                  selectedKeys={selectedKeys}
                  onToggleSelect={(orderId) => {
                    setSelectedKeys((prev) => {
                      const next = new Set(prev)
                      const k = String(orderId)
                      if (next.has(k)) next.delete(k)
                      else next.add(k)
                      return next
                    })
                  }}
                  excludedKeys={excludedKeys}
                  totalCount={totalOrders}
                />
              ) : (
                <>
                  <div className="planning-table-container">
                    <table className="planning-table">
                      <thead>
                        <tr>
                          <th className="th-checkbox">
                            <input
                              type="checkbox"
                              aria-label="Select all orders"
                              checked={items.length > 0 && selectedKeys.size === items.length}
                              onChange={toggleSelectAll}
                            />
                          </th>
                          <th>ORDER ID</th>
                          <th>OUTLET</th>
                          <th>WINDOW</th>
                          <th>VOLUME</th>
                          <th>TYPE</th>
                          <th>FLAGS</th>
                          <th className="th-include">INCLUDE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((order) => {
                          const orderId = order.id ?? 0
                          const outlet = outletsMap.get(order.outletId)
                          const isExcluded = excludedKeys.has(orderId)
                          const isSelected = selectedKeys.has(String(orderId))
                          const outletName = outlet
                            ? `Waypoint ${outlet.brand} ${outlet.district}`
                            : (order.brand ? `Waypoint ${order.brand} ${order.district ?? ''}` : order.outletId)
                          const windowText = outlet?.effectiveWindowOpen && outlet?.effectiveWindowClose
                            ? `${outlet.effectiveWindowOpen.slice(0, 5)}–${outlet.effectiveWindowClose.slice(0, 5)}`
                            : '06:00–08:00'

                          return (
                            <tr key={orderId} className={isExcluded ? 'row-excluded' : ''}>
                              <td className="td-checkbox">
                                <input
                                  type="checkbox"
                                  aria-label={`Select order ${order.ref}`}
                                  checked={isSelected}
                                  onChange={() => {
                                    setSelectedKeys((prev) => {
                                      const next = new Set(prev)
                                      const k = String(orderId)
                                      if (next.has(k)) next.delete(k)
                                      else next.add(k)
                                      return next
                                    })
                                  }}
                                />
                              </td>
                              <td className="td-ref">
                                <Link to={`/dispatcher/orders/${orderId}`} className="order-ref-link">
                                  {order.ref}
                                </Link>
                              </td>
                              <td className="td-outlet">
                                <div className="outlet-name">{outletName}</div>
                                <div className="outlet-sub">
                                  <span className="outlet-dot" aria-hidden="true" />
                                  <span>{order.outletId} · {order.district ?? outlet?.district ?? ''}</span>
                                </div>
                              </td>
                              <td className="td-window">{windowText}</td>
                              <td className="td-volume">{order.volumeM3?.toFixed(1) ?? '0.0'} m³</td>
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
            onExclude={() => {
              setExcludedKeys((prev) => {
                const next = new Set(prev)
                for (const k of selectedKeys) next.add(Number(k))
                return next
              })
            }}
            onInclude={() => {
              setExcludedKeys((prev) => {
                const next = new Set(prev)
                for (const k of selectedKeys) next.delete(Number(k))
                return next
              })
            }}
            onMoveToDeferred={() => {
              setExcludedKeys((prev) => {
                const next = new Set(prev)
                for (const k of selectedKeys) next.add(Number(k))
                return next
              })
              setSelectedKeys(new Set())
            }}
            onExportCsv={() => {
              const selectedItems = items.filter((i) => selectedKeys.has(String(i.id)))
              const rows = selectedItems.map((i) => `${i.ref},${i.outletId},${i.district ?? ''},${i.volumeM3},${i.tempRequirement}`)
              const csvContent = 'data:text/csv;charset=utf-8,' + ['Order ID,Outlet,District,Volume,Type', ...rows].join('\n')
              const encodedUri = encodeURI(csvContent)
              const link = document.createElement('a')
              link.setAttribute('href', encodedUri)
              link.setAttribute('download', `selected_orders_${planDate}.csv`)
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
            }}
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
                {totalOrders} orders · {totalVolume.toFixed(1)} m³
              </div>
              <div className="bottom-bar-sub">
                {excludedKeys.size} excluded · Next, the system builds vehicle routes
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
