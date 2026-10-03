import { useState, useMemo } from 'react'
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
import { EmptyState } from '../../components'

import type { ManualPlanView } from './manualPlanQueries'

type Snapshot = components['schemas']['PlanningSnapshot']

export interface GeneratedRouteSummary {
  vehicleId: string
  vehicleType: string
  driverName?: string
  stopsCount?: number
  utilisationPct?: number
  color?: string
}

export interface GeneratedPlanMetrics {
  routesCount: number
  vehiclesUsed: number
  totalVehicles: number
  allocatedOrders: number
  totalOrders: number
  unassignedOrders: number
  totalDistanceKm: number
  avgUtilisationPct: number
  onTimeWindowsPct: number
}

export interface GeneratedPlan {
  planId?: string
  status: 'pending' | 'generating' | 'ready' | 'failed'
  executionSeconds?: number
  metrics?: GeneratedPlanMetrics
  routes?: GeneratedRouteSummary[]
}

export interface PlanningStep2GenerateProps {
  snapshot: Snapshot | null
  orderCount: number
  totalVolume: number
  chilledCount: number
  activeDepot: string
  candidateView?: ManualPlanView | null
  plan?: GeneratedPlan | null
  onContinueToAllocation: () => void
  onGeneratePlan: () => Promise<boolean | void>
  onReloadPlan?: () => void
}

export function PlanningStep2Generate({
  snapshot,
  orderCount,
  totalVolume,
  chilledCount,
  activeDepot,
  candidateView,
  plan,
  onContinueToAllocation,
  onGeneratePlan,
  onReloadPlan,
}: PlanningStep2GenerateProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [isPlanReady, setIsPlanReady] = useState(Boolean(candidateView || (plan && plan.status === 'ready')))
  const [optionsOpen, setOptionsOpen] = useState(false)

  const valMetrics = candidateView?.validation?.metrics
  const vehiclesCount = valMetrics?.availableVehicles
  const frozenOrderCount = valMetrics?.totalOrders ?? snapshot?.orderCount ?? orderCount
  const frozenVolume = valMetrics?.totalOrderVolumeM3 ?? totalVolume

  async function handleStartGeneration() {
    setIsGenerating(true)
    setGenerationError(null)
    try {
      const created = await onGeneratePlan()
      if (created === false) throw new Error('The candidate could not be created. Review the error and retry.')
      setIsPlanReady(true)
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Plan generation could not be completed.')
    } finally {
      setIsGenerating(false)
    }
  }

  const candidateRoutes = useMemo<GeneratedRouteSummary[]>(() => {
    if (!candidateView?.trips || candidateView.trips.length === 0) return []
    const colors = ['#FFC20E', '#10B981', '#3B82F6', '#8B5CF6', '#F97316', '#EC4899']
    return candidateView.trips.map((trip, idx) => {
      const util = candidateView.utilisation?.[String(trip.id)]
      const pct = util?.volumeUtilisationPct
      return {
        vehicleId: trip.vehicleId ?? `Trip ${trip.id}`,
        vehicleType: `Slot ${trip.tripIndex} · ${trip.brand ?? ''}`,
        driverName: undefined,
        stopsCount: util?.stopCount,
        utilisationPct: pct,
        color: colors[idx % colors.length],
      }
    })
  }, [candidateView])

  const routes = candidateRoutes.length > 0 ? candidateRoutes : (plan?.routes ?? [])
  const metrics = plan?.metrics

  if (candidateView || isPlanReady || plan?.status === 'ready') {
    return (
      <div className="planning-step2-container animate-fade-in">
        {/* Success / Ready Banner */}
        <div className="plan-ready-banner">
          <div className="plan-ready-left">
            <div className="plan-ready-icon">
              <CheckCircle size={28} className="text-success" />
            </div>
            <div>
              <div className="plan-ready-title-row">
                <h2 className="plan-ready-title">
                  {candidateView
                    ? `Plan #${candidateView.plan.id} Frozen (Revision ${candidateView.plan.lockVersion})`
                    : plan?.executionSeconds
                      ? `Plan ready in ${plan.executionSeconds} seconds`
                      : 'Planning Snapshot Frozen'}
                </h2>
                <span className="badge-optimised">{candidateView ? candidateView.plan.status : 'Ready'}</span>
              </div>
              <p className="plan-ready-subtitle">
                {candidateView
                  ? `${valMetrics?.tripsUsed ?? '—'} active trips · ${valMetrics?.ordersAssigned ?? 0} orders allocated · ${valMetrics?.ordersUnassigned ?? orderCount} unassigned.`
                  : routes.length > 0
                    ? `${routes.length} routes built for ${metrics?.allocatedOrders ?? orderCount} orders.`
                    : `Snapshot #${snapshot?.id ?? 1} captured with ${orderCount} confirmed orders (${totalVolume.toFixed(1)} m³).`}
              </p>
            </div>
          </div>
          <div className="plan-ready-actions">
            {onReloadPlan ? (
              <button
                type="button"
                className="toolbar-btn"
                onClick={onReloadPlan}
              >
                <RotateCcw size={14} aria-hidden="true" />
                <span>Reload</span>
              </button>
            ) : null}
            <button
              type="button"
              className="toolbar-btn"
              disabled
            >
              <Sliders size={14} aria-hidden="true" />
              <span>Adjust constraints</span>
            </button>
            <button
              type="button"
              className="toolbar-btn"
              disabled={isGenerating}
              onClick={() => {
                setIsPlanReady(false)
                void handleStartGeneration()
              }}
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

        {/* Honest Architecture Notice */}
        <div style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-sm, 6px)', fontSize: '12px', color: '#475569', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={16} style={{ color: '#0284c7', flexShrink: 0 }} />
          <span><strong>Manual allocation:</strong> Choose vehicles and assign whole orders to trips. Each edit is validated against frozen inputs. Route optimization is unavailable.</span>
        </div>

        {/* 6 KPI Cards: If real metrics exist, display them; otherwise show captured snapshot metrics */}
        <div className="kpi-grid-6">
          <div className="kpi-tile">
            <div className="kpi-tile-header">
              <span className="kpi-icon-box yellow"><Sliders size={15} /></span>
              <span className="kpi-label">Routes</span>
            </div>
            <div className="kpi-value">{valMetrics?.tripsUsed ?? (candidateView ? '—' : (metrics ? metrics.routesCount : routes.length || '—'))}</div>
            <div className="kpi-sub">{candidateView ? `${candidateView.trips?.length ?? 0} active trips` : (routes.length > 0 ? 'active trips' : 'pending allocation')}</div>
          </div>

          <div className="kpi-tile">
            <div className="kpi-tile-header">
              <span className="kpi-icon-box orange"><Truck size={15} /></span>
              <span className="kpi-label">Vehicles used</span>
            </div>
            <div className="kpi-value">{valMetrics?.vehiclesUsed !== undefined ? `${valMetrics.vehiclesUsed} / ${vehiclesCount ?? '—'}` : (metrics ? `${metrics.vehiclesUsed} / ${metrics.totalVehicles}` : 'Freeze inputs to check')}</div>
            <div className="kpi-sub">Availability checked when inputs are frozen</div>
          </div>

          <div className="kpi-tile">
            <div className="kpi-tile-header">
              <span className="kpi-icon-box amber"><Box size={15} /></span>
              <span className="kpi-label">Orders allocated</span>
            </div>
            <div className="kpi-value">{valMetrics?.ordersAssigned !== undefined ? `${valMetrics.ordersAssigned} / ${frozenOrderCount}` : (metrics ? `${metrics.allocatedOrders} / ${metrics.totalOrders}` : `${orderCount} total`)}</div>
            <div className="kpi-sub">{valMetrics?.ordersUnassigned !== undefined ? `${valMetrics.ordersUnassigned} unassigned` : (metrics && metrics.unassignedOrders > 0 ? `${metrics.unassignedOrders} unassigned` : 'all in scope')}</div>
          </div>

          <div className="kpi-tile">
            <div className="kpi-tile-header">
              <span className="kpi-icon-box green"><ArrowRight size={15} /></span>
              <span className="kpi-label">Total distance</span>
            </div>
            <div className="kpi-value">{valMetrics?.totalDistanceKm !== undefined ? `${valMetrics.totalDistanceKm} km` : (metrics ? `${metrics.totalDistanceKm} km` : '—')}</div>
            <div className="kpi-sub">{candidateView ? 'calculated from trips' : 'calculated by solver'}</div>
          </div>

          <div className="kpi-tile">
            <div className="kpi-tile-header">
              <span className="kpi-icon-box teal"><CheckCircle size={15} /></span>
              <span className="kpi-label">Avg utilisation</span>
            </div>
            <div className="kpi-value">{valMetrics?.avgVolumeUtilisation !== undefined ? `${Math.round(valMetrics.avgVolumeUtilisation)}%` : (metrics ? `${metrics.avgUtilisationPct}%` : '—')}</div>
            <div className="kpi-sub">server-reported average</div>
          </div>

          <div className="kpi-tile">
            <div className="kpi-tile-header">
              <span className="kpi-icon-box blue"><Clock size={15} /></span>
              <span className="kpi-label">On-time windows</span>
            </div>
            <div className="kpi-value">{candidateView?.validation?.feasible !== undefined ? (candidateView.validation.feasible ? 'No violations' : 'Violations') : (metrics ? `${metrics.onTimeWindowsPct}%` : '—')}</div>
            <div className="kpi-sub">{candidateView ? (candidateView.validation?.feasible ? 'current assignments only' : 'review exceptions') : 'delivery adherence'}</div>
          </div>
        </div>

        {/* Lower Split: Route Overview / Real Routes List or Honest Empty State */}
        <div className="planning-split-card">
          {routes.length > 0 ? (
            <>
              {/* Left: Route Map Overview */}
              <div className="split-card-map-col">
                <div className="split-card-header">
                  <span className="split-card-title">Route overview · {routes.length} routes</span>
                </div>
                <div className="route-overview-canvas">
                  <div className="map-depot-badge" style={{ top: '15px', right: '140px' }}>
                    <Warehouse size={12} aria-hidden="true" />
                    <span>From {activeDepot} Depot</span>
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
                  {routes.map((route) => (
                    <div key={`${route.vehicleId}-${route.vehicleType}`} className="route-compact-card">
                      <div className="route-card-color-bar" style={{ background: route.color ?? '#FFC20E' }} />
                      <div className="route-card-info">
                        <div className="route-card-top">
                          <span className="route-card-veh">{route.vehicleId}</span>
                          <span className="route-card-type">{route.vehicleType}</span>
                        </div>
                        <div className="route-card-driver">
                          {route.driverName ? `${route.driverName} · ` : ''}{route.stopsCount === undefined ? 'Stop count unavailable' : `${route.stopsCount} stops`}
                        </div>
                      </div>
                      <div className="route-card-util">
                        <div className="route-util-num">{route.utilisationPct === undefined ? '—' : `${Math.round(route.utilisationPct)}%`}</div>
                        <div className="route-util-track">
                          <div className="route-util-fill" style={{ width: `${Math.min(100, Math.round(route.utilisationPct ?? 0))}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ width: '100%', padding: 'var(--space-24)' }}>
              <EmptyState
                title="Manual allocation required"
                description={`Snapshot inputs with ${frozenOrderCount} orders (${frozenVolume.toFixed(1)} m³) are frozen. Assign orders to vehicle trips in Review allocation.`}
                action={
                  <button
                    type="button"
                    className="btn-primary-yellow"
                    onClick={onContinueToAllocation}
                  >
                    <span>Proceed to Fleet Review</span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                }
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  // 2A: Configuration & Hero View
  return (
    <div className="planning-step2-container animate-fade-in">
      <div className="step2-layout-grid">
        {/* Main Column */}
        <div className="step2-main-col">
          {/* Section Header Matching Figma 2A */}
          <div className="step2-header-block">
            <h2 className="step2-section-title">Generate Delivery Plan</h2>
            <p className="step2-section-sub">
              Create a candidate from the closed-order snapshot, then allocate whole orders to vehicle trips manually.
            </p>
          </div>

          {/* 4 Metric Cards */}
          <div className="kpi-grid-4">
            <div className="kpi-tile">
              <div className="kpi-tile-header">
                <span className="kpi-icon-box orange"><Truck size={15} /></span>
                <span className="kpi-label">Vehicles</span>
              </div>
              <div className="kpi-value">{vehiclesCount ?? '—'}</div>
              <div className="kpi-sub">Availability checked when inputs are frozen</div>
            </div>

            <div className="kpi-tile">
              <div className="kpi-tile-header">
                <span className="kpi-icon-box amber"><Box size={15} /></span>
                <span className="kpi-label">Selected orders</span>
              </div>
              <div className="kpi-value">{orderCount}</div>
              <div className="kpi-sub">({totalVolume.toFixed(1)} m³)</div>
            </div>

            <div className="kpi-tile">
              <div className="kpi-tile-header">
                <span className="kpi-icon-box teal"><Snowflake size={15} /></span>
                <span className="kpi-label">Chilled</span>
              </div>
              <div className="kpi-value">{chilledCount} orders</div>
              <div className="kpi-sub">Reefer requirement</div>
            </div>

            <div className="kpi-tile">
              <div className="kpi-tile-header">
                <span className="kpi-icon-box blue"><Clock size={15} /></span>
                <span className="kpi-label">Windows</span>
              </div>
              <div className="kpi-value">Per outlet</div>
              <div className="kpi-sub">Frozen outlet windows</div>
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
                <Sliders size={15} className="text-secondary" aria-hidden="true" />
                <div>
                  <div className="options-title">Planning Options (Advanced)</div>
                  <div className="options-subtitle">Rules are enforced by the backend using frozen reference inputs.</div>
                </div>
              </div>
              {optionsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {optionsOpen && (
              <div className="options-content-body animate-slide-down">
                <p>Shift budgets, service allowances and cold-chain requirements come from the planning snapshot. Editing these rules here is unavailable.</p>
              </div>
            )}
          </div>

          {/* Hero Illustration & Action Card */}
          <div className="step2-hero-card">
            <div className={`step2-hero-graphic ${isGenerating ? 'is-driving' : ''}`}>
              <svg width="240" height="110" viewBox="0 0 240 110" fill="none" aria-hidden="true">
                <defs>
                  <linearGradient id="headlightBeam" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#FEF08A" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#FEF08A" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Road surface */}
                <line x1="0" y1="94" x2="240" y2="94" stroke="#E2E8F0" strokeWidth="2" />
                <line
                  x1="0"
                  y1="94"
                  x2="240"
                  y2="94"
                  stroke="#FFC20E"
                  strokeWidth="2.5"
                  strokeDasharray="14 10"
                  className={isGenerating ? 'anim-road-dash' : ''}
                />

                {/* Dynamic Wind / Speed lines */}
                <g className={isGenerating ? 'anim-speed-lines' : 'speed-lines-idle'}>
                  <line x1="15" y1="40" x2="55" y2="40" stroke="#FFC20E" strokeWidth="3" strokeLinecap="round" />
                  <line x1="5" y1="56" x2="45" y2="56" stroke="#FFC20E" strokeWidth="2.5" strokeLinecap="round" />
                  <line x1="20" y1="74" x2="52" y2="74" stroke="#FFC20E" strokeWidth="3" strokeLinecap="round" />
                </g>

                {/* Truck Body Group with Suspension Bounce */}
                <g className={isGenerating ? 'anim-truck-body' : ''}>
                  {/* Cargo Container */}
                  <rect x="68" y="24" width="94" height="54" rx="5" fill="#FFFFFF" stroke="#1E293B" strokeWidth="3" />
                  {/* Waypoint Decal on Container */}
                  <circle cx="115" cy="51" r="14" fill="#FEF9C3" />
                  <path d="M 111 51 L 119 47 L 117 56 Z" fill="#FFC20E" />
                  <line x1="78" y1="36" x2="152" y2="36" stroke="#F1F5F9" strokeWidth="1.5" />
                  <line x1="78" y1="66" x2="152" y2="66" stroke="#F1F5F9" strokeWidth="1.5" />

                  {/* Cab */}
                  <path d="M 162 42 L 196 42 L 208 62 L 208 78 L 162 78 Z" fill="#FFC20E" stroke="#1E293B" strokeWidth="3" />
                  <path d="M 168 48 L 192 48 L 200 62 L 168 62 Z" fill="#1E293B" />

                  {/* Headlight beam */}
                  {isGenerating && (
                    <polygon points="208,68 240,60 240,82" fill="url(#headlightBeam)" opacity="0.65" />
                  )}
                </g>

                {/* Front & Rear Wheels with spinning rims */}
                <g transform="translate(98, 80)">
                  <circle cx="0" cy="0" r="14" fill="#1E293B" />
                  <circle cx="0" cy="0" r="6" fill="#F8FAFC" />
                  <g className={isGenerating ? 'anim-wheel-spin' : ''}>
                    <line x1="-5" y1="0" x2="5" y2="0" stroke="#64748B" strokeWidth="2" />
                    <line x1="0" y1="-5" x2="0" y2="5" stroke="#64748B" strokeWidth="2" />
                  </g>
                </g>
                <g transform="translate(182, 80)">
                  <circle cx="0" cy="0" r="14" fill="#1E293B" />
                  <circle cx="0" cy="0" r="6" fill="#F8FAFC" />
                  <g className={isGenerating ? 'anim-wheel-spin' : ''}>
                    <line x1="-5" y1="0" x2="5" y2="0" stroke="#64748B" strokeWidth="2" />
                    <line x1="0" y1="-5" x2="0" y2="5" stroke="#64748B" strokeWidth="2" />
                  </g>
                </g>
              </svg>
            </div>

            {isGenerating ? (
              <div className="step2-generating-container animate-fade-in">
                <div className="generating-active-step" role="status">
                  <div className="generating-step-spinner" />
                  <span className="generating-step-text">Creating a validated manual candidate…</span>
                </div>
                <p>Allocate routes in the next step after the server saves the candidate.</p>
              </div>
            ) : (
              <div className="step2-hero-action">
                <button
                  type="button"
                  className="btn-primary-yellow large"
                  disabled={orderCount === 0}
                  onClick={() => void handleStartGeneration()}
                >
                  <Sparkles size={18} aria-hidden="true" />
                  <span>Generate Delivery Plan</span>
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
                {generationError && (
                  <p className="text-danger" style={{ marginTop: 'var(--space-8)', fontSize: '13px' }}>
                    {generationError}
                  </p>
                )}
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
                  <div className="side-value">{orderCount} ({totalVolume.toFixed(1)} m³)</div>
                </div>
              </div>

              <div className="side-summary-row">
                <span className="side-icon-box"><Truck size={16} /></span>
                <div>
                  <div className="side-label">Available vehicles</div>
                  <div className="side-value">{vehiclesCount === undefined ? 'Freeze inputs to check availability' : `${vehiclesCount} available at ${activeDepot}`} </div>
                </div>
              </div>

              <div className="side-summary-row">
                <span className="side-icon-box"><Sliders size={16} /></span>
                <div>
                  <div className="side-label">Depot scope</div>
                  <div className="side-value">{activeDepot} Depot</div>
                </div>
              </div>

              <div className="side-summary-row">
                <span className="side-icon-box"><Clock size={16} /></span>
                <div>
                  <div className="side-label">Snapshot status</div>
                  <div className="side-value">{snapshot ? `Snapshot #${snapshot.id} ready` : 'New snapshot on generate'}</div>
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
              Review and assign vehicle trips that start from {activeDepot.endsWith('Depot') ? activeDepot : `${activeDepot} Depot`}, considering delivery time windows, vehicle capacities, and cold chain requirements.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
