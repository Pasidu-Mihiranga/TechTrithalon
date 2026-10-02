import { useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Info,
  Layers,
  RotateCw,
  Truck,
  Warehouse,
  X,
} from 'lucide-react'

export interface PlanningStep3AllocationProps {
  onBackToSummary: () => void
  onContinueToExceptions: () => void
}

interface VehicleCardData {
  id: string
  type: string
  badge: 'Reefer' | 'Lorry' | 'Van'
  driver: string
  region: string
  tripsSummary: string
  trips: Array<{ name: string; tag: string; stops: number }>
  volume: { used: number; total: number; unit: string }
  weight: { used: number; total: number; unit: string }
  time: { used: number; total: number; unit: string }
  fuel: { remaining: number; total: number; unit: string }
  freshBudget?: string
  warning?: string
  accentColor: string
}

const VEHICLES: VehicleCardData[] = [
  {
    id: 'VEH014',
    type: 'Reefer 5T',
    badge: 'Reefer',
    driver: 'Kasun Perera',
    region: 'Colombo',
    tripsSummary: '2 trips · 98 km',
    trips: [
      { name: 'Trip 1', tag: 'Fresh · Colombo', stops: 6 },
      { name: 'Trip 2', tag: 'Style · Gampaha', stops: 4 },
    ],
    volume: { used: 34.2, total: 38, unit: 'm³' },
    weight: { used: 2840, total: 5000, unit: 'kg' },
    time: { used: 213, total: 270, unit: 'min' },
    fuel: { remaining: 238, total: 380, unit: 'L left' },
    freshBudget: '03:30–08:00',
    accentColor: '#FFC20E',
  },
  {
    id: 'VEH021',
    type: 'Lorry 5T',
    badge: 'Lorry',
    driver: 'Dinesh Silva',
    region: 'Dehiwala & Mt Lavinia',
    tripsSummary: '1 trip · 86 km',
    trips: [{ name: 'Trip 1', tag: 'Dry & Ambient · Dehiwala', stops: 15 }],
    volume: { used: 31.8, total: 38, unit: 'm³' },
    weight: { used: 3200, total: 5000, unit: 'kg' },
    time: { used: 245, total: 270, unit: 'min' },
    fuel: { remaining: 290, total: 380, unit: 'L left' },
    warning: '1 stop may miss its window · ORD-1186 08:25',
    accentColor: '#10B981',
  },
  {
    id: 'VEH055',
    type: 'Van 1T',
    badge: 'Van',
    driver: 'Chaminda Bandara',
    region: 'Rajagiriya & Battaramulla',
    tripsSummary: '1 trip · 42 km',
    trips: [{ name: 'Trip 1', tag: 'Narrow Access · Rajagiriya', stops: 8 }],
    volume: { used: 8.5, total: 10, unit: 'm³' },
    weight: { used: 850, total: 1000, unit: 'kg' },
    time: { used: 165, total: 240, unit: 'min' },
    fuel: { remaining: 340, total: 380, unit: 'L left' },
    accentColor: '#8B5CF6',
  },
  {
    id: 'VEH009',
    type: 'Reefer 3T',
    badge: 'Reefer',
    driver: 'Nuwan Pradeep',
    region: 'Colombo 03 & 07',
    tripsSummary: '1 trip · 64 km',
    trips: [{ name: 'Trip 1', tag: 'Dairy & Fresh · Col 03', stops: 7 }],
    volume: { used: 22.4, total: 24, unit: 'm³' },
    weight: { used: 2400, total: 3000, unit: 'kg' },
    time: { used: 190, total: 260, unit: 'min' },
    fuel: { remaining: 275, total: 380, unit: 'L left' },
    freshBudget: '04:00–08:30',
    accentColor: '#3B82F6',
  },
]

interface StopItem {
  id: string
  outletName: string
  address: string
  window: string
  volume: string
}

const STOPS_FOR_VEH021: StopItem[] = [
  { id: 'ORD-1101', outletName: 'Fort Bazaar Wholesale', address: 'Church St, Dehiwala', window: '08:00–10:00', volume: '3.2 m³' },
  { id: 'ORD-1102', outletName: 'Waypoint Fresh Dehiwala', address: 'Lighthouse St, Dehiwala', window: '08:30–10:30', volume: '2.8 m³' },
  { id: 'ORD-1103', outletName: 'Waypoint Fresh Mt Lavinia', address: 'Galle Rd, Mt Lavinia', window: '09:00–11:00', volume: '4.1 m³' },
  { id: 'ORD-1104', outletName: 'Waypoint Fresh Dehiwala 02', address: 'Pedlar St, Dehiwala', window: '10:00–12:00', volume: '1.9 m³' },
  { id: 'ORD-1105', outletName: 'Waypoint Express Kawdana', address: 'Station Rd, Dehiwala', window: '10:30–12:30', volume: '2.5 m³' },
]

export function PlanningStep3Allocation({
  onBackToSummary,
  onContinueToExceptions,
}: PlanningStep3AllocationProps) {
  const [filterType, setFilterType] = useState<'All' | 'Lorry' | 'Reefer' | 'Van'>('All')
  const [selectedVehId, setSelectedVehId] = useState<string>('VEH014')
  const [routeViewMode, setRouteViewMode] = useState<'this' | 'all'>('this')

  // Drawer 3C state
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Modal 3D state
  const [modalOpen, setModalOpen] = useState(false)
  const [targetOrderForSwap, setTargetOrderForSwap] = useState<StopItem | null>(null)
  const [selectedSwapVeh, setSelectedSwapVeh] = useState('VEH055')

  const activeVehicle = VEHICLES.find((v) => v.id === selectedVehId) || VEHICLES[0]

  const filteredVehicles = VEHICLES.filter((v) => {
    if (filterType === 'All') return true
    return v.badge === filterType
  })

  function handleOpenChangeVehicle(stop: StopItem) {
    setTargetOrderForSwap(stop)
    setModalOpen(true)
  }

  function handleConfirmSwap() {
    setModalOpen(false)
    setDrawerOpen(false)
  }

  return (
    <div className="planning-step3-container animate-fade-in">
      {/* Step 3 Main Layout: Left Vehicle Cards, Right Route Map */}
      <div className="step3-grid">
        {/* Left Column: Vehicles List */}
        <div className="step3-left-col">
          <div className="step3-list-toolbar">
            <div className="step3-veh-count-row">
              <span className="step3-veh-title">Vehicles</span>
              <span className="step3-veh-count-badge">14</span>
            </div>

            <div className="step3-sort-dropdown">
              <span>Sort: utilisation</span>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
          </div>

          {/* Filter Pills */}
          <div className="step3-filter-pills" role="tablist">
            {(['All', 'Lorry', 'Reefer', 'Van'] as const).map((t) => {
              const count = t === 'All' ? 14 : t === 'Lorry' ? 9 : t === 'Reefer' ? 3 : 2
              return (
                <button
                  key={t}
                  type="button"
                  className={`filter-pill ${filterType === t ? 'active' : ''}`}
                  onClick={() => setFilterType(t)}
                >
                  <span>{t}</span>
                  <span className="pill-badge">{count}</span>
                </button>
              )
            })}
          </div>

          {/* Vehicle Cards */}
          <div className="step3-vehicle-cards-list">
            {filteredVehicles.map((v) => {
              const isSelected = v.id === selectedVehId
              const volPct = Math.round((v.volume.used / v.volume.total) * 100)
              const wtPct = Math.round((v.weight.used / v.weight.total) * 100)
              const timePct = Math.round((v.time.used / v.time.total) * 100)

              return (
                <div
                  key={v.id}
                  className={`veh-alloc-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedVehId(v.id)}
                >
                  <div className="veh-card-accent-bar" style={{ background: v.accentColor }} />
                  <div className="veh-card-body">
                    {/* Header */}
                    <div className="veh-card-head">
                      <div className="veh-card-title-group">
                        <span className="veh-card-id">{v.id}</span>
                        <span className="veh-card-type-tag">{v.type}</span>
                      </div>
                      <span className="veh-card-trips-summary">{v.tripsSummary}</span>
                    </div>

                    <div className="veh-card-driver">
                      {v.driver} · {v.region}
                    </div>

                    {/* Trips badges */}
                    <div className="veh-trips-tags">
                      {v.trips.map((tr) => (
                        <span key={tr.name} className="veh-trip-pill">
                          <strong>{tr.name}</strong> {tr.tag} · {tr.stops} stops
                        </span>
                      ))}
                    </div>

                    {/* Utilisation multi-bars */}
                    <div className="veh-util-bars">
                      <div className="util-row">
                        <span className="util-metric-name">Volume</span>
                        <div className="util-bar-bg">
                          <div className="util-bar-fill blue" style={{ width: `${volPct}%` }} />
                        </div>
                        <span className="util-metric-vals">{v.volume.used} / {v.volume.total} m³</span>
                      </div>

                      <div className="util-row">
                        <span className="util-metric-name">Weight</span>
                        <div className="util-bar-bg">
                          <div className="util-bar-fill purple" style={{ width: `${wtPct}%` }} />
                        </div>
                        <span className="util-metric-vals">{v.weight.used.toLocaleString()} / {v.weight.total.toLocaleString()} kg</span>
                      </div>

                      <div className="util-row">
                        <span className="util-metric-name">Time</span>
                        <div className="util-bar-bg">
                          <div className="util-bar-fill green" style={{ width: `${timePct}%` }} />
                        </div>
                        <span className="util-metric-vals">{v.time.used} / {v.time.total} min</span>
                      </div>

                      <div className="util-row">
                        <span className="util-metric-name">Fuel</span>
                        <span className="util-metric-fuel">{v.fuel.remaining} / {v.fuel.total} L left</span>
                      </div>

                      {v.freshBudget && (
                        <div className="veh-fresh-budget">
                          Fresh budget: {v.freshBudget}
                        </div>
                      )}
                    </div>

                    {/* Warning Callout if present */}
                    {v.warning && (
                      <div className="veh-warning-banner">
                        <AlertTriangle size={13} aria-hidden="true" />
                        <span>{v.warning}</span>
                      </div>
                    )}

                    <div className="veh-card-actions">
                      <button
                        type="button"
                        className="veh-view-stops-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedVehId(v.id)
                          setDrawerOpen(true)
                        }}
                      >
                        <Layers size={13} aria-hidden="true" />
                        <span>View stops sequence</span>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Column: Route Map Inspection */}
        <div className="step3-right-col">
          <div className="route-inspect-card">
            {/* Inspector Header */}
            <div className="route-inspect-head">
              <div>
                <div className="route-inspect-title">
                  <span className="route-veh-accent" style={{ background: activeVehicle.accentColor }} />
                  <span>{activeVehicle.id} - {activeVehicle.region}</span>
                </div>
                <div className="route-inspect-sub">
                  {activeVehicle.driver} · Trip 1 · 6 stops · 98 km · departs 04:30 · 213/270 min
                </div>
              </div>

              <div className="route-inspect-controls">
                <div className="segmented-control" role="group">
                  <button
                    type="button"
                    className={`segmented-btn ${routeViewMode === 'this' ? 'active' : ''}`}
                    onClick={() => setRouteViewMode('this')}
                  >
                    This route
                  </button>
                  <button
                    type="button"
                    className={`segmented-btn ${routeViewMode === 'all' ? 'active' : ''}`}
                    onClick={() => setRouteViewMode('all')}
                  >
                    All routes
                  </button>
                </div>

                <button type="button" className="toolbar-btn">
                  <RotateCw size={13} aria-hidden="true" />
                  <span>Re-optimise</span>
                </button>
              </div>
            </div>

            {/* Canvas Map View */}
            <div className="route-map-canvas-container">
              <svg viewBox="0 0 750 480" className="route-detail-svg" preserveAspectRatio="xMidYMid slice" aria-label="Route detail path">
                <defs>
                  <filter id="routeShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.2" />
                  </filter>
                </defs>

                {/* Base Map */}
                <rect width="750" height="480" fill="#F1F5F9" />
                <path d="M 120 0 L 750 0 L 750 480 L 220 480 Q 180 400 190 320 Q 210 240 160 170 Q 130 90 120 0 Z" fill="#F8FAFC" />
                <ellipse cx="380" cy="220" rx="90" ry="60" fill="#E2F0D9" opacity="0.8" />

                {/* Secondary non-active route lines if All routes is clicked */}
                {routeViewMode === 'all' && (
                  <>
                    <path d="M 320 80 Q 420 180 460 300" fill="none" stroke="#F97316" strokeWidth="3" opacity="0.5" />
                    <path d="M 320 80 Q 220 160 180 320" fill="none" stroke="#10B981" strokeWidth="3" opacity="0.5" />
                    <path d="M 320 80 Q 480 150 560 260" fill="none" stroke="#3B82F6" strokeWidth="3" opacity="0.5" />
                  </>
                )}

                {/* Active Route Path */}
                <path
                  d="M 320 80 Q 400 160 380 230 T 260 340 T 210 400"
                  fill="none"
                  stroke="#4F46E5"
                  strokeWidth="6"
                  strokeLinecap="round"
                  filter="url(#routeShadow)"
                />

                {/* Depot */}
                <circle cx="320" cy="80" r="9" fill="#1E293B" />
                <circle cx="320" cy="80" r="4" fill="#FFC20E" />

                {/* Sequential Stop Pins */}
                <g transform="translate(380, 230)">
                  <circle r="12" fill="#4F46E5" />
                  <text textAnchor="middle" dy="4" fill="#FFFFFF" fontSize="11" fontWeight="700">1</text>
                </g>
                <g transform="translate(320, 290)">
                  <circle r="12" fill="#4F46E5" />
                  <text textAnchor="middle" dy="4" fill="#FFFFFF" fontSize="11" fontWeight="700">2</text>
                </g>
                <g transform="translate(260, 340)">
                  <circle r="12" fill="#4F46E5" />
                  <text textAnchor="middle" dy="4" fill="#FFFFFF" fontSize="11" fontWeight="700">3</text>
                </g>
                <g transform="translate(210, 400)">
                  <circle r="12" fill="#4F46E5" />
                  <text textAnchor="middle" dy="4" fill="#FFFFFF" fontSize="11" fontWeight="700">4</text>
                </g>
              </svg>

              {/* Peliyagoda Depot Badge */}
              <div className="map-depot-badge" style={{ top: '24px', left: '200px' }}>
                <Warehouse size={13} aria-hidden="true" />
                <span>From Peliyagoda Depot</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Drawer 3C: Vehicle Plan Review (Stops Sequence) */}
      {drawerOpen && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="drawer-panel animate-slide-left" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-head-info">
                <div className="drawer-title">{activeVehicle.driver} · {activeVehicle.type}</div>
                <div className="drawer-subtitle">{activeVehicle.region}</div>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close stops drawer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick stats pills */}
            <div className="drawer-stats-row">
              <div className="drawer-stat-tile">
                <span className="drawer-stat-val">15</span>
                <span className="drawer-stat-lbl">Stops</span>
              </div>
              <div className="drawer-stat-tile">
                <span className="drawer-stat-val">86%</span>
                <span className="drawer-stat-lbl">Capacity</span>
              </div>
            </div>

            <div className="drawer-stops-section">
              <div className="drawer-section-title">STOPS ON THIS ROUTE</div>
              <div className="drawer-stops-list">
                {STOPS_FOR_VEH021.map((stop, idx) => (
                  <div key={stop.id} className="drawer-stop-card">
                    <div className="drawer-stop-top">
                      <span className="stop-idx-badge">{idx + 1}</span>
                      <div>
                        <div className="stop-outlet-title">
                          <strong>{stop.id}</strong> {stop.outletName}
                        </div>
                        <div className="stop-outlet-address">{stop.address}</div>
                      </div>
                    </div>

                    <div className="drawer-stop-meta">
                      <span className="stop-time-badge">
                        <Clock size={12} aria-hidden="true" />
                        <span>{stop.window}</span>
                      </span>
                      <span className="stop-vol">{stop.volume}</span>
                    </div>

                    <div className="drawer-stop-actions">
                      <button
                        type="button"
                        className="btn-change-vehicle"
                        onClick={() => handleOpenChangeVehicle(stop)}
                      >
                        <Truck size={13} aria-hidden="true" />
                        <span>Change Vehicle</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3D: Change Vehicle */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-dialog-card animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="modal-title">Change vehicle</h3>
              <p className="modal-subtitle">
                {targetOrderForSwap?.id || 'ORD-1115'} · {targetOrderForSwap?.outletName || 'Waypoint Fresh Kalubowila'} · {targetOrderForSwap?.window || '06:30–07:00 window'}
              </p>
            </div>

            <div className="modal-section-label">COMPATIBLE VEHICLES NEARBY</div>

            <div className="swap-options-list">
              {[
                {
                  id: 'VEH055',
                  name: 'Van 1T',
                  stats: '61% capacity · +12 min detour',
                  badge: 'Compatible · Recommended',
                  badgeType: 'success',
                },
                {
                  id: 'VEH027',
                  name: 'Lorry 5T',
                  stats: '78% capacity · +26 min detour',
                  badge: 'Tight capacity',
                  badgeType: 'warning',
                },
                {
                  id: 'VEH009',
                  name: 'Reefer 3T',
                  stats: '71% capacity · +34 min detour',
                  badge: 'Compatible · over-spec',
                  badgeType: 'neutral',
                },
                {
                  id: 'VEH033',
                  name: 'Lorry 5T',
                  stats: '86% capacity · +18 min detour',
                  badge: 'Near capacity limit',
                  badgeType: 'warning',
                },
              ].map((veh) => (
                <label
                  key={veh.id}
                  className={`swap-veh-option ${selectedSwapVeh === veh.id ? 'active' : ''}`}
                >
                  <input
                    type="radio"
                    name="swap-vehicle"
                    value={veh.id}
                    checked={selectedSwapVeh === veh.id}
                    onChange={() => setSelectedSwapVeh(veh.id)}
                    className="swap-radio"
                  />
                  <div className="swap-veh-info">
                    <div className="swap-veh-name">
                      <strong>{veh.id}</strong> {veh.name}
                    </div>
                    <div className="swap-veh-stats">{veh.stats}</div>
                  </div>
                  <span className={`swap-badge swap-badge-${veh.badgeType}`}>
                    {veh.badge}
                  </span>
                </label>
              ))}
            </div>

            <div className="modal-actions-footer">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-modal-confirm"
                onClick={handleConfirmSwap}
              >
                <Check size={16} aria-hidden="true" />
                <span>Confirm Change</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 Sticky Bottom Bar */}
      <div className="planning-bottom-bar">
        <div className="bottom-bar-left">
          <div className="bottom-bar-metric">
            <Info size={16} className="text-info inline-icon" aria-hidden="true" />
            <span>180 orders allocated across 14 vehicles</span>
          </div>
          <div className="bottom-bar-sub">
            6 orders couldn't be placed automatically. You'll handle them in the next step.
          </div>
        </div>
        <div className="bottom-bar-right">
          <button
            type="button"
            className="toolbar-btn"
            onClick={onBackToSummary}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Back to plan summary</span>
          </button>
          <button
            type="button"
            className="btn-primary-yellow"
            onClick={onContinueToExceptions}
          >
            <span>Continue to exceptions</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
