import { useState } from 'react'
import { Box, Snowflake, Warehouse, Plus, Minus, Clock } from 'lucide-react'
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

interface ClusterMarker {
  id: string
  label: string
  count: number
  x: number // percentage
  y: number // percentage
  orderId?: number
  color?: string
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
  const [zoomLevel, setZoomLevel] = useState(1)

  const activeOrder = orders.find((o) => o.id === activeOrderId) || orders[0]
  const activeOutlet = activeOrder ? outletsMap.get(activeOrder.outletId) : null

  const clusters: ClusterMarker[] = [
    { id: 'c3', label: 'Colombo 03', count: 22, x: 26, y: 44, color: '#FFC20E' },
    { id: 'c7', label: 'Colombo 07', count: 46, x: 44, y: 55, color: '#FFC20E', orderId: activeOrder?.id },
    { id: 'raj', label: 'Rajagiriya', count: 16, x: 62, y: 35, color: '#FFC20E' },
    { id: 'nug', label: 'Nugegoda', count: 24, x: 68, y: 62, color: '#FFC20E' },
    { id: 'deh', label: 'Dehiwala', count: 14, x: 50, y: 80, color: '#FFC20E' },
    { id: 'mtl', label: 'Mt Lavinia', count: 38, x: 78, y: 84, color: '#FFC20E' },
  ]

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
              : '05:30–07:30'

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

      {/* Right Column: Interactive Map Canvas */}
      <div className="map-split-canvas-container">
        <svg
          className="map-canvas-svg"
          viewBox="0 0 800 500"
          preserveAspectRatio="xMidYMid slice"
          aria-label="Colombo delivery region map"
          style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center', transition: 'transform 0.2s ease' }}
        >
          <defs>
            <linearGradient id="oceanGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#E2E8F0" />
              <stop offset="100%" stopColor="#CBD5E1" />
            </linearGradient>
            <linearGradient id="landGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F8FAFC" />
              <stop offset="100%" stopColor="#F1F5F9" />
            </linearGradient>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
            </filter>
          </defs>

          {/* Background: Ocean / Coast */}
          <rect width="800" height="500" fill="url(#oceanGrad)" />

          {/* Land mass shape (Colombo western coastline) */}
          <path
            d="M 120 0 L 800 0 L 800 500 L 220 500 Q 180 400 190 320 Q 210 240 160 170 Q 130 90 120 0 Z"
            fill="url(#landGrad)"
          />

          {/* Green zones / parks (e.g. Viharamahadevi, wetlands) */}
          <ellipse cx="380" cy="220" rx="90" ry="60" fill="#E2F0D9" opacity="0.8" />
          <ellipse cx="620" cy="380" rx="70" ry="40" fill="#E2F0D9" opacity="0.6" />

          {/* Major arterial roads (Colombo roads network) */}
          <path d="M 120 0 Q 220 180 230 500" fill="none" stroke="#FFFFFF" strokeWidth="8" />
          <path d="M 120 0 Q 220 180 230 500" fill="none" stroke="#E2E8F0" strokeWidth="4" />
          <path d="M 320 60 Q 420 220 480 500" fill="none" stroke="#FFFFFF" strokeWidth="7" />
          <path d="M 320 60 Q 420 220 480 500" fill="none" stroke="#E2E8F0" strokeWidth="3" />
          <path d="M 170 170 L 680 180" fill="none" stroke="#FFFFFF" strokeWidth="6" />
          <path d="M 170 170 L 680 180" fill="none" stroke="#E2E8F0" strokeWidth="2.5" />
          <path d="M 200 320 L 720 310" fill="none" stroke="#FFFFFF" strokeWidth="6" />
          <path d="M 200 320 L 720 310" fill="none" stroke="#E2E8F0" strokeWidth="2.5" />

          {/* Connection lines from Depot to selected outlets */}
          <path
            d="M 320 80 Q 300 180 340 270"
            fill="none"
            stroke="#3B82F6"
            strokeWidth="3.5"
            strokeDasharray="6 3"
            opacity="0.8"
          />
          <path
            d="M 320 80 Q 450 140 500 175"
            fill="none"
            stroke="#EF4444"
            strokeWidth="2.5"
            opacity="0.6"
          />

          {/* Minor delivery stop markers */}
          <circle cx="280" cy="370" r="5" fill="#10B981" />
          <circle cx="430" cy="380" r="6" fill="#10B981" />
          <circle cx="580" cy="370" r="5" fill="#10B981" />
          <circle cx="340" cy="270" r="9" fill="#2563EB" filter="url(#shadow)" />
          <circle cx="340" cy="270" r="4" fill="#FFFFFF" />
          <circle cx="500" cy="175" r="7" fill="#EF4444" filter="url(#shadow)" />
        </svg>

        {/* Peliyagoda Depot Badge */}
        <div className="map-depot-badge" style={{ top: '35px', left: '190px' }}>
          <Warehouse size={13} className="depot-icon" aria-hidden="true" />
          <span>Peliyagoda Depot</span>
          <span className="depot-arrow" aria-hidden="true">↗</span>
        </div>

        {/* Map Cluster Markers */}
        {clusters.map((c) => {
          const isCurrentActive = c.orderId === activeOrder?.id
          return (
            <button
              key={c.id}
              type="button"
              className={`map-cluster-pin ${isCurrentActive ? 'pin-active' : ''}`}
              style={{ top: `${c.y}%`, left: `${c.x}%` }}
              onClick={() => {
                if (c.orderId) setActiveOrderId(c.orderId)
              }}
              aria-label={`${c.count} deliveries in ${c.label}`}
            >
              <span className="pin-count">{c.count}</span>
              <span className="pin-label">{c.label}</span>
            </button>
          )
        })}

        {/* Zoom Controls */}
        <div className="map-zoom-controls">
          <button
            type="button"
            className="map-zoom-btn"
            onClick={() => setZoomLevel((z) => Math.min(z + 0.2, 1.8))}
            aria-label="Zoom in"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            className="map-zoom-btn"
            onClick={() => setZoomLevel((z) => Math.max(z - 0.2, 0.8))}
            aria-label="Zoom out"
          >
            <Minus size={16} />
          </button>
        </div>

        {/* Active Order Detail Popup */}
        {activeOrder && (
          <div className="map-order-popup" style={{ bottom: '28px', right: '32px' }}>
            <div className="popup-top">
              <span className="popup-ref">{activeOrder.ref}</span>
            </div>
            <div className="popup-outlet-name">
              {activeOutlet ? `Waypoint ${activeOutlet.brand} ${activeOutlet.district}` : `Waypoint ${activeOrder.brand || ''} Colombo 07`}
            </div>
            <div className="popup-sub">
              <span>📍 {activeOrder.outletId} · {activeOrder.district ?? 'Colombo'}</span>
            </div>
            <div className="popup-footer">
              <span className="popup-window">
                🕒 {activeOutlet?.effectiveWindowOpen ? `${activeOutlet.effectiveWindowOpen.slice(0, 5)}–${activeOutlet.effectiveWindowClose?.slice(0, 5)}` : '05:30–07:30'}
              </span>
              <span className="popup-dot">·</span>
              <span className="popup-vol">{activeOrder.volumeM3?.toFixed(1) ?? '2.7'} m³</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
