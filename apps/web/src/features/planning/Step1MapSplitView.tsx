import { useState } from 'react'
import { Box, Snowflake, Clock } from 'lucide-react'
import { EmptyState } from '../../components'
import type { components } from '../../generated/api'

type OrderItem = components['schemas']['CustomerOrder']
type OutletItem = components['schemas']['Outlet']

export interface Step1MapSplitViewProps {
  orders: OrderItem[]
  outletsMap: Map<string, OutletItem>
  selectedKeys: Set<string>
  onToggleSelect: (id: number) => void
  excludedKeys: Set<number>
  totalCount: number
}

export function Step1MapSplitView({
  orders,
  outletsMap,
  selectedKeys,
  onToggleSelect,
  excludedKeys,
  totalCount,
}: Step1MapSplitViewProps) {
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

            const outletName = outlet
              ? `Waypoint ${outlet.brand} ${outlet.district}`
              : (order.brand ? `Waypoint ${order.brand} ${order.district ?? ''}` : order.outletId)

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
                    <span>{order.outletId} · {order.district ?? 'Colombo'}</span>
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
        <EmptyState title="Outlet coordinates unavailable"
          description="The reference data includes districts and delivery windows, but no outlet coordinates. Use the order list to review and select orders." />
      </div>
    </div>
  )
}
