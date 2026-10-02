import { useState } from 'react'
import {
  ArrowRight,
  Box,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  RotateCcw,
  Sliders,
  Snowflake,
  Sparkles,
  Truck,
  Warehouse,
} from 'lucide-react'
import type { components } from '../../generated/api'

type Snapshot = components['schemas']['PlanningSnapshot']

export interface PlanningStep2GenerateProps {
  snapshot: Snapshot | null
  orderCount: number
  totalVolume: number
  chilledCount: number
  activeDepot: string
  onContinueToAllocation: () => void
  onGeneratePlan: () => Promise<void>
}

export function PlanningStep2Generate({
  orderCount,
  totalVolume,
  chilledCount,
  activeDepot,
  onContinueToAllocation,
  onGeneratePlan,
}: PlanningStep2GenerateProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPlanReady, setIsPlanReady] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [progress, setProgress] = useState(0)

  // Advanced options state
  const [maxHours, setMaxHours] = useState('8')
  const [serviceMin, setServiceMin] = useState('15')
  const [coldChainStrict, setColdChainStrict] = useState(true)

  async function handleStartGeneration() {
    setIsGenerating(true)
    setProgress(15)

    try {
      await onGeneratePlan()
    } catch {
      // Continue simulation flow if backend has no planner worker yet
    }

    const timer1 = setTimeout(() => setProgress(45), 400)
    const timer2 = setTimeout(() => setProgress(82), 800)
    const timer3 = setTimeout(() => {
      setProgress(100)
      setIsGenerating(false)
      setIsPlanReady(true)
    }, 1200)

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)
    }
  }

  // Pre-calculated metrics matching Figma
  const vehiclesCount = 16
  const allocatedCount = orderCount > 0 ? Math.max(1, orderCount - 6) : 180
  const unassignedCount = orderCount > 0 ? Math.min(6, orderCount) : 6

  const routesSample = [
    { id: 'VEH014', type: 'Lorry 5T', driver: 'Kasun Perera', stops: 6, utilisation: 90, color: '#FFC20E' },
    { id: 'VEH021', type: 'Lorry 5T', driver: 'Dinesh Silva', stops: 5, utilisation: 84, color: '#10B981' },
    { id: 'VEH009', type: 'Reefer 3T', driver: 'Nuwan Pradeep', stops: 7, utilisation: 92, color: '#3B82F6' },
    { id: 'VEH055', type: 'Van 1T', driver: 'Chaminda Bandara', stops: 8, utilisation: 78, color: '#8B5CF6' },
    { id: 'VEH033', type: 'Lorry 5T', driver: 'Saman Kumara', stops: 6, utilisation: 86, color: '#F97316' },
    { id: 'VEH065', type: 'Van 1T', driver: 'Sunil Jayasuriya', stops: 7, utilisation: 82, color: '#EC4899' },
  ]

  if (isPlanReady) {
    return (
      <div className="planning-step2-container animate-fade-in">
        {/* Success Banner */}
        <div className="plan-ready-banner">
          <div className="plan-ready-left">
            <div className="plan-ready-icon">
              <CheckCircle size={28} className="text-success" />
            </div>
            <div>
              <div className="plan-ready-title-row">
                <h2 className="plan-ready-title">Plan ready in 28 seconds</h2>
                <span className="badge-optimised">Optimised</span>
              </div>
              <p className="plan-ready-subtitle">
                14 routes built for {allocatedCount} of {orderCount || 186} orders. {unassignedCount} orders need your attention before the plan can be sent.
              </p>
            </div>
          </div>
          <div className="plan-ready-actions">
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => setIsPlanReady(false)}
            >
              <Sliders size={14} aria-hidden="true" />
              <span>Adjust constraints</span>
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => void handleStartGeneration()}
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>Re-run</span>
            </button>
            <button
              type="button"
              className="btn-primary-yellow"
              onClick={onContinueToAllocation}
            >
              <span>Review allocation</span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* 6 KPI Cards */}
        <div className="kpi-grid-6">
          <div className="kpi-tile">
            <div className="kpi-tile-header">
              <span className="kpi-icon-box yellow"><Sliders size={15} /></span>
              <span className="kpi-label">Routes</span>
            </div>
            <div className="kpi-value">14</div>
            <div className="kpi-sub">avg 5.2 stops each</div>
          </div>

          <div className="kpi-tile">
            <div className="kpi-tile-header">
              <span className="kpi-icon-box orange"><Truck size={15} /></span>
              <span className="kpi-label">Vehicles used</span>
            </div>
            <div className="kpi-value">14 / 16</div>
            <div className="kpi-sub">2 on standby</div>
          </div>

          <div className="kpi-tile">
            <div className="kpi-tile-header">
              <span className="kpi-icon-box amber"><Box size={15} /></span>
              <span className="kpi-label">Orders allocated</span>
            </div>
            <div className="kpi-value">{allocatedCount} / {orderCount || 186}</div>
            <div className="kpi-sub text-warning">{unassignedCount} need attention</div>
          </div>

          <div className="kpi-tile">
            <div className="kpi-tile-header">
              <span className="kpi-icon-box green"><ArrowRight size={15} /></span>
              <span className="kpi-label">Total distance</span>
            </div>
            <div className="kpi-value">1,126 km</div>
            <div className="kpi-sub text-success">-8% vs last Tuesday</div>
          </div>

          <div className="kpi-tile">
            <div className="kpi-tile-header">
              <span className="kpi-icon-box teal"><CheckCircle size={15} /></span>
              <span className="kpi-label">Avg utilisation</span>
            </div>
            <div className="kpi-value">87%</div>
            <div className="kpi-sub">target 85%</div>
          </div>

          <div className="kpi-tile">
            <div className="kpi-tile-header">
              <span className="kpi-icon-box blue"><Clock size={15} /></span>
              <span className="kpi-label">On-time windows</span>
            </div>
            <div className="kpi-value">98%</div>
            <div className="kpi-sub">176 of 180 stops</div>
          </div>
        </div>

        {/* Lower Split: Map Overview + Routes List */}
        <div className="planning-split-card">
          {/* Left: Route Map Overview */}
          <div className="split-card-map-col">
            <div className="split-card-header">
              <span className="split-card-title">Route overview · showing 6 of 14</span>
              <button type="button" className="text-btn">Show all routes</button>
            </div>
            <div className="route-overview-canvas">
              <svg viewBox="0 0 500 320" className="route-map-svg" aria-label="Route network map">
                <rect width="500" height="320" fill="#F8FAFC" rx="8" />
                <path d="M 80 0 Q 150 120 170 320" fill="none" stroke="#E2E8F0" strokeWidth="6" />
                <ellipse cx="260" cy="180" rx="60" ry="40" fill="#E2F0D9" opacity="0.7" />

                {/* Hub Depot */}
                <circle cx="280" cy="80" r="10" fill="#1E293B" />
                <circle cx="280" cy="80" r="5" fill="#FFC20E" />

                {/* Radiating routes */}
                <path d="M 280 80 Q 200 130 180 240" fill="none" stroke="#FFC20E" strokeWidth="3.5" />
                <path d="M 280 80 Q 230 180 240 270" fill="none" stroke="#EF4444" strokeWidth="3" />
                <path d="M 280 80 Q 320 170 350 250" fill="none" stroke="#3B82F6" strokeWidth="3" />
                <path d="M 280 80 Q 380 140 430 200" fill="none" stroke="#8B5CF6" strokeWidth="3" />
                <path d="M 280 80 Q 300 120 305 210" fill="none" stroke="#10B981" strokeWidth="3" />

                {/* Stop dots */}
                <circle cx="180" cy="240" r="5" fill="#FFC20E" />
                <circle cx="240" cy="270" r="5" fill="#EF4444" />
                <circle cx="350" cy="250" r="5" fill="#3B82F6" />
                <circle cx="430" cy="200" r="5" fill="#8B5CF6" />
                <circle cx="305" cy="210" r="5" fill="#10B981" />
              </svg>
              <div className="map-depot-badge" style={{ top: '15px', right: '140px' }}>
                <Warehouse size={12} aria-hidden="true" />
                <span>From Peliyagoda Depot</span>
              </div>
            </div>
          </div>

          {/* Right: Routes Utilisation List */}
          <div className="split-card-routes-col">
            <div className="split-card-header">
              <span className="split-card-title">Routes</span>
              <span className="split-card-sub">Utilisation</span>
            </div>
            <div className="routes-list-scroll">
              {routesSample.map((route) => (
                <div key={route.id} className="route-compact-card">
                  <div className="route-card-color-bar" style={{ background: route.color }} />
                  <div className="route-card-info">
                    <div className="route-card-top">
                      <span className="route-card-veh">{route.id}</span>
                      <span className="route-card-type">{route.type}</span>
                    </div>
                    <div className="route-card-driver">
                      {route.driver} · {route.stops} stops
                    </div>
                  </div>
                  <div className="route-card-util">
                    <div className="util-progress-bar">
                      <div
                        className="util-progress-fill"
                        style={{ width: `${route.utilisation}%`, background: route.utilisation >= 90 ? '#10B981' : '#FFC20E' }}
                      />
                    </div>
                    <span className="util-percent">{route.utilisation}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 2A: Configuration & Hero View
  return (
    <div className="planning-step2-container animate-fade-in">
      <div className="planning-step2-grid">
        {/* Left Column: Config, Metrics & Illustration */}
        <div className="step2-main-col">
          <div className="step2-section-head">
            <h2 className="step2-title">Generate Delivery Plan</h2>
            <p className="step2-subtitle">
              The system will automatically allocate the selected orders to available vehicles and create optimized routes.
            </p>
          </div>

          {/* 4 Metric Cards */}
          <div className="kpi-grid-4">
            <div className="kpi-tile">
              <div className="kpi-tile-header">
                <span className="kpi-icon-box orange"><Truck size={16} /></span>
                <span className="kpi-label">Vehicles</span>
              </div>
              <div className="kpi-value">{vehiclesCount}</div>
              <div className="kpi-sub">local depot</div>
            </div>

            <div className="kpi-tile">
              <div className="kpi-tile-header">
                <span className="kpi-icon-box amber"><Box size={16} /></span>
                <span className="kpi-label">Selected orders</span>
              </div>
              <div className="kpi-value">{orderCount || 186}</div>
              <div className="kpi-sub">({totalVolume ? totalVolume.toFixed(1) : '412.5'} m³)</div>
            </div>

            <div className="kpi-tile">
              <div className="kpi-tile-header">
                <span className="kpi-icon-box teal"><Snowflake size={16} /></span>
                <span className="kpi-label">Chilled</span>
              </div>
              <div className="kpi-value">{chilledCount || 32} orders</div>
              <div className="kpi-sub">Reefer only</div>
            </div>

            <div className="kpi-tile">
              <div className="kpi-tile-header">
                <span className="kpi-icon-box blue"><Clock size={16} /></span>
                <span className="kpi-label">Windows</span>
              </div>
              <div className="kpi-value">06:30 – 17:00</div>
              <div className="kpi-sub">Fixed times</div>
            </div>
          </div>

          {/* Collapsible Advanced Options */}
          <div className="step2-options-card">
            <button
              type="button"
              className="options-toggle-btn"
              onClick={() => setOptionsOpen(!optionsOpen)}
              aria-expanded={optionsOpen}
            >
              <div className="options-toggle-left">
                <Sliders size={16} className="text-secondary" aria-hidden="true" />
                <div>
                  <div className="options-title">Planning Options (Advanced)</div>
                  <div className="options-subtitle">These settings are based on operational rules and can be adjusted if needed.</div>
                </div>
              </div>
              {optionsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {optionsOpen && (
              <div className="options-content-body animate-slide-down">
                <div className="options-fields-grid">
                  <div className="option-field">
                    <label className="field-label" htmlFor="opt-shift">Max shift duration</label>
                    <select
                      id="opt-shift"
                      className="field-select"
                      value={maxHours}
                      onChange={(e) => setMaxHours(e.target.value)}
                    >
                      <option value="6">6 Hours</option>
                      <option value="8">8 Hours (Standard)</option>
                      <option value="10">10 Hours</option>
                    </select>
                  </div>

                  <div className="option-field">
                    <label className="field-label" htmlFor="opt-service">Service per stop</label>
                    <select
                      id="opt-service"
                      className="field-select"
                      value={serviceMin}
                      onChange={(e) => setServiceMin(e.target.value)}
                    >
                      <option value="10">10 Minutes</option>
                      <option value="15">15 Minutes (Default)</option>
                      <option value="20">20 Minutes</option>
                    </select>
                  </div>

                  <div className="option-field">
                    <label className="field-label">Cold chain priority</label>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={coldChainStrict}
                      className={`toggle-switch ${coldChainStrict ? 'active' : ''}`}
                      onClick={() => setColdChainStrict(!coldChainStrict)}
                    >
                      <span className="toggle-thumb" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Hero Illustration & Action Card */}
          <div className="step2-hero-card">
            <div className="step2-hero-graphic">
              <svg width="220" height="120" viewBox="0 0 220 120" fill="none" aria-hidden="true">
                {/* Motion dash lines */}
                <line x1="20" y1="50" x2="60" y2="50" stroke="#FFC20E" strokeWidth="4" strokeLinecap="round" />
                <line x1="10" y1="65" x2="45" y2="65" stroke="#FFC20E" strokeWidth="3" strokeLinecap="round" />
                <line x1="25" y1="80" x2="55" y2="80" stroke="#FFC20E" strokeWidth="4" strokeLinecap="round" />

                {/* Truck Body */}
                <rect x="70" y="30" width="90" height="55" rx="6" fill="#FFFFFF" stroke="#1E293B" strokeWidth="3" />
                <path d="M 160 50 L 195 50 L 205 70 L 205 85 L 160 85 Z" fill="#FFC20E" stroke="#1E293B" strokeWidth="3" />
                {/* Truck Cabin Window */}
                <path d="M 165 56 L 190 56 L 197 70 L 165 70 Z" fill="#1E293B" />
                {/* Wheels */}
                <circle cx="100" cy="88" r="14" fill="#1E293B" />
                <circle cx="100" cy="88" r="6" fill="#FFFFFF" />
                <circle cx="180" cy="88" r="14" fill="#1E293B" />
                <circle cx="180" cy="88" r="6" fill="#FFFFFF" />
              </svg>
            </div>

            {isGenerating ? (
              <div className="step2-generating-status">
                <div className="generating-spinner" />
                <div className="generating-text">
                  <div className="generating-title">Optimising vehicle routes and time windows...</div>
                  <div className="generating-bar-track">
                    <div className="generating-bar-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="generating-percent">{progress}% completed</div>
                </div>
              </div>
            ) : (
              <div className="step2-hero-action">
                <button
                  type="button"
                  className="btn-primary-yellow large"
                  onClick={() => void handleStartGeneration()}
                >
                  <Sparkles size={18} aria-hidden="true" />
                  <span>Generate Delivery Plan</span>
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Rail: Planning Summary & Next Steps */}
        <div className="step2-side-rail">
          <div className="planning-side-card">
            <h3 className="side-card-title">Planning Summary</h3>
            <div className="side-summary-rows">
              <div className="side-summary-row">
                <span className="side-icon-box"><Box size={16} /></span>
                <div>
                  <div className="side-label">Selected orders</div>
                  <div className="side-value">{orderCount || 186} ({totalVolume ? totalVolume.toFixed(1) : '412.5'} m³)</div>
                </div>
              </div>

              <div className="side-summary-row">
                <span className="side-icon-box"><Truck size={16} /></span>
                <div>
                  <div className="side-label">Available vehicles</div>
                  <div className="side-value">16 at {activeDepot || 'Peliyagoda'}</div>
                </div>
              </div>

              <div className="side-summary-row">
                <span className="side-icon-box"><Sliders size={16} /></span>
                <div>
                  <div className="side-label">Estimated routes</div>
                  <div className="side-value">5–8 based on vehicle capacity</div>
                </div>
              </div>

              <div className="side-summary-row">
                <span className="side-icon-box"><Clock size={16} /></span>
                <div>
                  <div className="side-label">Estimated time</div>
                  <div className="side-value">2–5 minutes</div>
                </div>
              </div>
            </div>
          </div>

          <div className="info-callout-card">
            <div className="info-callout-head">
              <Info size={16} className="text-info" aria-hidden="true" />
              <span className="info-callout-title">What happens next?</span>
            </div>
            <p className="info-callout-body">
              The system will create optimized routes that start from {activeDepot || 'Peliyagoda Depot'}, considering delivery time windows, vehicle capacities, and cold chain requirements.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
