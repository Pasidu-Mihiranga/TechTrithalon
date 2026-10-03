import { useMemo, useState } from 'react'
import { Box, Snowflake, Clock } from 'lucide-react'
import { Button, DistrictMap, EmptyState, ErrorState, LoadingState } from '../../components'
import type { components } from '../../generated/api'
import { useGeography } from '../../lib/referenceQueries'
import { useDistrictDemand } from '../ordering/orderQueries'

type OrderItem = components['schemas']['CustomerOrder']
type OutletItem = components['schemas']['Outlet']

export interface Step1MapSplitViewProps {
  orders: OrderItem[]
  outletsMap: Map<string, OutletItem>
  selectedKeys: Set<string>
  onToggleSelect: (id: number) => void
  excludedKeys: Set<number>
  totalCount: number
  /** The date and depot of the queue; the district map is computed by the server for exactly this scope. */
  planDate: string
  depot: string
  /** District currently filtering the list, or null. */
  activeDistrict: string | null
  onSelectDistrict: (district: string | null) => void
}

export function Step1MapSplitView({
  orders,
  outletsMap,
  selectedKeys,
  onToggleSelect,
  excludedKeys,
  totalCount,
  planDate,
  depot,
  activeDistrict,
  onSelectDistrict,
}: Step1MapSplitViewProps) {
  const geography = useGeography()
  const demand = useDistrictDemand(planDate, depot)
  const byDistrict = useMemo(() => new Map((demand.data ?? []).map(row => [row.district, row])), [demand.data])
  const values = useMemo(() => Object.fromEntries((demand.data ?? []).map(row => [row.district, row.orders])), [demand.data])
  const badges = useMemo(() => Object.fromEntries((demand.data ?? []).map(row => [row.district, String(row.orders)])), [demand.data])
  const details = useMemo(() => Object.fromEntries((demand.data ?? []).map(row => [row.district, [
    `${row.orders} orders · ${row.volumeM3} m³`,
    `${row.chilledOrders} chilled · ${row.ambientOrders} ambient`,
    ...(row.vanOnlyOrders > 0 ? [`${row.vanOnlyOrders} van-only outlets`] : []),
    ...(row.carriedOrders > 0 ? [`${row.carriedOrders} carried from a deferral`] : []),
    'Click to filter the list',
  ]])), [demand.data])
  const link = activeDistrict ? geography.data?.links.find(l => l.district === activeDistrict) : undefined
  const active = activeDistrict ? byDistrict.get(activeDistrict) : undefined
  const [activeOrderId, setActiveOrderId] = useState<number | null>(() => {
    return orders[0]?.id ?? null
  })
  return (
    <div className="planning-map-split">
      {/* Left Column: Compact Order List */}
      <div className="map-split-orders">
        <div className="map-split-header">
          <span className="map-split-count">
            <strong>{totalCount} orders</strong> ({excludedKeys.size} excluded)
          </span>
          <div className="map-split-sort">
            <Clock size={13} aria-hidden="true" />
            <span>Window</span>
          </div>
        </div>

        <div className="map-split-list" role="list">
          {orders.map((order) => {
            const orderId = order.id ?? 0
            const outlet = outletsMap.get(order.outletId)
            const isSelected = selectedKeys.has(String(orderId))
            const isActive = activeOrderId === orderId
            const isExcluded = excludedKeys.has(orderId)

            const outletName = `${order.outletId} · ${outlet?.brand ?? order.brand ?? 'brand unavailable'}`

            const windowText = outlet?.effectiveWindowOpen && outlet?.effectiveWindowClose
              ? `${outlet.effectiveWindowOpen.slice(0, 5)}–${outlet.effectiveWindowClose.slice(0, 5)}`
              : '—'

            return (
              <div
                key={orderId}
                className={`map-split-row ${isActive ? 'active' : ''} ${isExcluded ? 'excluded' : ''}`}
                onClick={() => setActiveOrderId(orderId)}
                role="listitem"
              >
                <input
                  type="checkbox"
                  aria-label={`Select order ${order.ref}`}
                  checked={isSelected}
                  onChange={(e) => {
                    e.stopPropagation()
                    onToggleSelect(orderId)
                  }}
                  className="map-row-checkbox"
                />
                <div className="map-row-details">
                  <div className="map-row-outlet">{outletName}</div>
                  <div className="map-row-sub">
                    <span className="map-row-ref">{order.ref}</span>
                    <span className="map-row-dot">·</span>
                    <span>{order.district ?? 'district unavailable'}</span>
                  </div>
                </div>
                <div className="map-row-meta">
                  <div className="map-row-window">{windowText}</div>
                  {order.tempRequirement === 'chilled' ? (
                    <span className="type-pill type-pill-fridge compact">
                      <Snowflake size={11} aria-hidden="true" />
                      <span>Refrigerated</span>
                    </span>
                  ) : (
                    <span className="type-pill type-pill-normal compact">
                      <Box size={11} aria-hidden="true" />
                      <span>Normal</span>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="map-split-canvas-container">
        {geography.isPending || demand.isPending ? <LoadingState rows={3} label="Loading district map" /> : null}
        {geography.isError ? <ErrorState error={geography.error} message="The district map could not be loaded." onRetry={() => void geography.refetch()} /> : null}
        {demand.isError ? <ErrorState error={demand.error} message="District demand could not be loaded." onRetry={() => void demand.refetch()} /> : null}
        {geography.data && demand.data && (
          demand.data.length === 0
            ? <EmptyState title="No orders in this queue" description="There is no confirmed demand for this date and depot to show on the map." />
            : <>
              {activeDistrict && (
                <div className="district-filter" role="status">
                  <span>Showing orders in <strong>{activeDistrict}</strong>{active ? ` (${active.orders})` : ''}</span>
                  <Button variant="secondary" onClick={() => onSelectDistrict(null)}>Clear</Button>
                </div>
              )}
              <DistrictMap geography={geography.data} values={values} badges={badges} details={details} legend="Orders in the queue"
                depot={depot} selected={activeDistrict} onSelect={onSelectDistrict} emphasised={activeDistrict ? [activeDistrict] : undefined} height={520} label="Order demand by district" />
              <div role="group" aria-label="Filter by district" className="district-chips">
                {demand.data.map(row => (
                  <button key={row.district} type="button" className={`district-chip${activeDistrict === row.district ? ' active' : ''}`}
                    aria-pressed={activeDistrict === row.district} onClick={() => onSelectDistrict(activeDistrict === row.district ? null : row.district)}>
                    {row.district} <span className="district-chip-count">{row.orders}</span>
                  </button>
                ))}
              </div>
              {activeDistrict && active && (
                <dl className="district-summary" aria-label={`${activeDistrict} demand`}>
                  <div><dt>Orders</dt><dd>{active.orders}</dd></div>
                  <div><dt>Volume</dt><dd>{active.volumeM3} m³</dd></div>
                  <div><dt>Chilled</dt><dd>{active.chilledOrders}</dd></div>
                  <div><dt>Van-only</dt><dd>{active.vanOnlyOrders}</dd></div>
                  {link && <div><dt>From {link.depot}</dt><dd>{link.depotToDistrictKm} km · {link.depotToDistrictMinutes} min</dd></div>}
                </dl>
              )}
            </>
        )}
      </div>
    </div>
  )
}
