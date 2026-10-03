import { useState, useMemo } from 'react'
import type { FormEvent } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Info,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { useVehicles } from '../../lib/referenceQueries'
import { EmptyState, ErrorState, ViolationCard } from '../../components'
import { InteractiveRouteMap } from './InteractiveRouteMap'
import type { Edit, ManualPlanView } from './manualPlanQueries'
import { ManualPlanRequestError } from './manualPlanQueries'

export interface VehicleTripInfo {
  name: string
  tag: string
  stops: number
}

export interface VehicleRouteStop {
  seq: number
  ref: string
  outletName: string
  /** Outlet's effective delivery window from the frozen reference data, or a truthful unavailable label. */
  window: string
  /** Server-computed planned arrival for this stop, when the candidate has been scheduled. */
  plannedArrival?: string
  volume: string
  brand: string
  isChilled?: boolean
  district?: string
  outletId?: string
  orderId?: number
  tripId?: number
}

export interface VehicleAllocationCard {
  id: string
  tripId?: number
  tripIndex?: number
  vehicleId?: string
  brand?: string
  district?: string
  type: string
  badge: 'Reefer' | 'Lorry' | 'Van'
  driver?: string
  region?: string
  tripsSummary?: string
  trips?: VehicleTripInfo[]
  volume: { used: number; total: number; unit: string }
  weight: { used: number; total: number; unit: string }
  time?: { used: number; total: number; unit: string }
  fuel?: { remaining: number; total: number; unit: string }
  freshBudget?: string
  warning?: string
  accentColor: string
  stops?: VehicleRouteStop[]
}

export interface PlanningStep3AllocationProps {
  routes?: VehicleAllocationCard[]
  activeDepot?: string
  candidateView?: ManualPlanView | null
  onApplyCommand?: (edit: Edit) => Promise<boolean | void>
  reason?: string
  onReasonChange?: (reason: string) => void
  failure?: Error | null
  onReloadPlan?: () => void
  actionPending?: boolean
  onBackToSummary: () => void
  onContinueToExceptions: () => void
  onChangeVehicle?: (oldVehId: string, newVehId: string) => void
}

type SortOption = 'utilisation' | 'id' | 'capacity'

export function PlanningStep3Allocation({
  routes,
  activeDepot = 'Peliyagoda',
  candidateView,
  onApplyCommand,
  reason = 'Manual allocation edit',
  onReasonChange,
  failure,
  onReloadPlan,
  onBackToSummary,
  onContinueToExceptions,
  onChangeVehicle,
}: PlanningStep3AllocationProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'reefer' | 'lorry' | 'van'>('all')
  const [sortBy, setSortBy] = useState<SortOption>('utilisation')
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)

  // Drawer (3C) & Modal (3D) states
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [changeModalOpen, setChangeModalOpen] = useState(false)
  const [targetSwapId, setTargetSwapId] = useState<string | null>(null)
  const [targetSwapSlot, setTargetSwapSlot] = useState(1)

  // Add Trip Modal state
  const [addTripModalOpen, setAddTripModalOpen] = useState(false)
  const [newTripVehicle, setNewTripVehicle] = useState('')
  const [newTripSlot, setNewTripSlot] = useState(1)
  const [newTripBrand, setNewTripBrand] = useState('')
  const [newTripDistrict, setNewTripDistrict] = useState('')
  const [assignTargetOrderId, setAssignTargetOrderId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch real reference vehicles from backend database
  const vehiclesQuery = useVehicles()
  const realVehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data])

  const isLocked = candidateView?.plan.status === 'published'
  const blocked = isLocked || isSubmitting

  const displayVehicles = useMemo<VehicleAllocationCard[]>(() => {
    if (routes && routes.length > 0) return routes

    if (candidateView) {
      const colors = ['#FFC20E', '#10B981', '#3B82F6', '#8B5CF6', '#F97316', '#EC4899']
      const cards: VehicleAllocationCard[] = []
      const trips = candidateView.trips ?? []
      const fleet = candidateView.fleet ?? []

      // First map all active trips
      trips.forEach((trip, idx) => {
        const util = candidateView.utilisation?.[String(trip.id)]
        const fleetVeh = fleet.find((f) => f.vehicleId === trip.vehicleId)
        const refVeh = realVehicles.find((r) => r.vehicleId === trip.vehicleId)
        const temp = fleetVeh?.temp?.toLowerCase() || refVeh?.temp?.toLowerCase() || ''
        const isReefer = temp.includes('reefer') || temp.includes('chilled')
        const isVan = fleetVeh?.vehicleId?.toLowerCase().includes('van') || refVeh?.type?.toLowerCase().includes('van')
        const badge: 'Reefer' | 'Lorry' | 'Van' = isReefer ? 'Reefer' : isVan ? 'Van' : 'Lorry'
        const dayUse = candidateView.vehicleUtilisation?.[trip.vehicleId ?? '']
        const fresh = trip.brand?.toLowerCase() === 'fresh'
        const weightCap = util?.weightLimitKg ?? fleetVeh?.weightCapKg ?? refVeh?.weightCapKg ?? 0
        const volumeCap = util?.volumeLimitM3 ?? fleetVeh?.volumeCapM3 ?? refVeh?.volumeCapM3 ?? 0

        cards.push({
          id: trip.vehicleId ?? `Trip-${trip.id}`,
          tripId: trip.id,
          tripIndex: trip.tripIndex,
          vehicleId: trip.vehicleId,
          brand: trip.brand,
          district: trip.district,
          type: `${badge} · Slot ${trip.tripIndex ?? 1} · ${trip.brand ?? ''}`,
          badge,
          driver: undefined,
          region: `${trip.district ?? activeDepot} Fleet`,
          tripsSummary: `Trip ${trip.id} · ${trip.stops?.length ?? 0} stops · ${trip.tripMinutes ?? '—'} min · ${trip.distanceKm ?? '—'} km`,
          trips: [
            {
              name: `Slot ${trip.tripIndex ?? 1}`,
              tag: trip.brand ?? 'All',
              stops: trip.stops?.length ?? 0,
            },
          ],
          volume: {
            used: util?.volumeUsedM3 ?? 0,
            total: volumeCap,
            unit: 'm³',
          },
          weight: {
            used: util?.weightUsedKg ?? 0,
            total: weightCap,
            unit: 'kg',
          },
          // The vehicle-day budget for this trip's brand group, as computed by the server.
          time: {
            used: (fresh ? dayUse?.freshMinutesUsed : dayUse?.otherMinutesUsed) ?? 0,
            total: (fresh ? dayUse?.freshMinutesLimit : dayUse?.otherMinutesLimit) ?? 0,
            unit: 'min',
          },
          fuel: {
            remaining: trip.fuelLitres ?? 0,
            total: dayUse?.weeklyFuelLimitL ?? fleetVeh?.weeklyFuelQuotaL ?? refVeh?.weeklyFuelQuotaL ?? 0,
            unit: 'L this trip · weekly quota',
          },
          accentColor: colors[idx % colors.length],
          stops: (trip.stops ?? []).map((s, sIdx) => ({
            seq: s.stopIndex ?? sIdx + 1,
            ref: s.order?.orderRef ?? `ORD-${s.orderId}`,
            outletName: s.order ? `${s.order.outletId} · ${s.order.district ?? 'district unavailable'}` : `Order ${s.orderId}`,
            window: formatDeliveryWindow(s.order?.effectiveWindowOpen, s.order?.effectiveWindowClose),
            plannedArrival: s.plannedArrival ? s.plannedArrival.slice(0, 5) : undefined,
            volume: `${s.order?.volumeM3?.toFixed(1) ?? '0.0'} m³`,
            brand: s.order?.brand ?? trip.brand ?? '',
            isChilled: Boolean(s.order?.temp && (s.order.temp.toLowerCase().includes('chilled') || s.order.temp.toLowerCase().includes('reefer'))),
            district: s.order?.district ?? trip.district,
            outletId: s.order?.outletId,
            orderId: s.orderId,
            tripId: trip.id,
          })),
        })
      })

      // Also append available standby fleet vehicles that have no trip yet
      fleet.forEach((veh, idx) => {
        if (!trips.some((t) => t.vehicleId === veh.vehicleId)) {
          const refVeh = realVehicles.find((r) => r.vehicleId === veh.vehicleId)
          const temp = veh.temp?.toLowerCase() || refVeh?.temp?.toLowerCase() || ''
          const isReefer = temp.includes('reefer') || temp.includes('chilled')
          const isVan = veh.vehicleId?.toLowerCase().includes('van') || refVeh?.type?.toLowerCase().includes('van')
          const badge: 'Reefer' | 'Lorry' | 'Van' = isReefer ? 'Reefer' : isVan ? 'Van' : 'Lorry'
          cards.push({
            id: veh.vehicleId ?? `VEH-${idx}`,
            vehicleId: veh.vehicleId,
            type: `${badge} (Standby)`,
            badge,
            driver: undefined,
            region: `${activeDepot} Fleet`,
            tripsSummary: 'Standby · Ready for routes',
            trips: [],
            volume: { used: 0, total: veh.volumeCapM3 ?? refVeh?.volumeCapM3 ?? 0, unit: 'm³' },
            weight: { used: 0, total: veh.weightCapKg ?? refVeh?.weightCapKg ?? 0, unit: 'kg' },
            time: { used: 0, total: 0, unit: 'min' },
            fuel: {
              remaining: 0,
              total: candidateView.vehicleUtilisation?.[veh.vehicleId ?? '']?.weeklyFuelLimitL ?? veh.weeklyFuelQuotaL ?? refVeh?.weeklyFuelQuotaL ?? 0,
              unit: 'L this trip · weekly quota',
            },
            accentColor: '#94a3b8',
            stops: [],
          })
        }
      })

      if (cards.length > 0) return cards
    }

    // Fallback: Map real reference vehicles for the depot
    const depotVehicles = realVehicles.filter(
      (v) => !activeDepot || !v.depot || v.depot.toLowerCase() === activeDepot.toLowerCase()
    )
    const list = depotVehicles.length > 0 ? depotVehicles : realVehicles
    const colors = ['#FFC20E', '#10B981', '#3B82F6', '#8B5CF6', '#F97316', '#EC4899']

    return list.slice(0, 14).map((v, i) => {
      const isReefer = v.temp?.toLowerCase() === 'reefer'
      const isVan = v.type?.toLowerCase() === 'van'
      const weightTons = Math.round((v.weightCapKg ?? 0) / 1000)

      return {
        id: v.vehicleId,
        type: `${isReefer ? 'Reefer' : isVan ? 'Van' : 'Truck'} ${weightTons}T`,
        badge: (isReefer ? 'Reefer' : isVan ? 'Van' : 'Lorry') as 'Reefer' | 'Lorry' | 'Van',
        driver: undefined,
        region: v.depot ? `${v.depot} Depot Fleet` : 'Depot Fleet',
        tripsSummary: 'Standby · Ready for routes',
        trips: [],
        volume: { used: 0, total: v.volumeCapM3 ?? 0, unit: 'm³' },
        weight: { used: 0, total: v.weightCapKg ?? 0, unit: 'kg' },
        time: { used: 0, total: 0, unit: 'min' },
        fuel: { remaining: 0, total: v.weeklyFuelQuotaL ?? 0, unit: 'L this trip · weekly quota' },
        accentColor: colors[i % colors.length],
        stops: [],
      }
    })
  }, [routes, candidateView, realVehicles, activeDepot])

  // Category counts
  const lorryCount = displayVehicles.filter((v) => v.badge === 'Lorry').length
  const reeferCount = displayVehicles.filter((v) => v.badge === 'Reefer').length
  const vanCount = displayVehicles.filter((v) => v.badge === 'Van').length

  // Filter & Sort
  const processedVehicles = useMemo(() => {
    let list = displayVehicles.filter((v) => {
      if (activeTab === 'all') return true
      if (activeTab === 'reefer') return v.badge === 'Reefer'
      if (activeTab === 'lorry') return v.badge === 'Lorry'
      if (activeTab === 'van') return v.badge === 'Van'
      return true
    })

    list = [...list].sort((a, b) => {
      if (sortBy === 'utilisation') {
        const utilA = (a.volume.used / (a.volume.total || 1)) + (a.weight.used / (a.weight.total || 1))
        const utilB = (b.volume.used / (b.volume.total || 1)) + (b.weight.used / (b.weight.total || 1))
        return utilB - utilA
      }
      if (sortBy === 'id') {
        return a.id.localeCompare(b.id, undefined, { numeric: true })
      }
      if (sortBy === 'capacity') {
        return b.volume.total - a.volume.total
      }
      return 0
    })

    return list
  }, [displayVehicles, activeTab, sortBy])

  const activeVehicle = displayVehicles.find((v) => v.id === selectedVehicleId) || processedVehicles[0] || displayVehicles[0]

  const serverMetrics = candidateView?.validation?.metrics
  const allocatedVehiclesCount = serverMetrics?.vehiclesUsed ?? displayVehicles.filter((v) => v.volume.used > 0).length
  const totalOrdersPlaced = serverMetrics?.ordersAssigned ?? displayVehicles.reduce((acc, v) => acc + (v.stops?.length ?? 0), 0)

  // Map representation of all routes
  const allRoutesForMap = useMemo(() => {
    return displayVehicles.map((v) => ({
      vehicleId: v.id,
      color: v.accentColor,
      stops: v.stops ?? [],
    }))
  }, [displayVehicles])

  const availableBrands = useMemo(() => {
    const list = new Set<string>()
    candidateView?.unassignedOrders?.forEach((o) => { if (o.order?.brand) list.add(o.order.brand) })
    candidateView?.trips?.forEach((t) => { if (t.brand) list.add(t.brand) })
    return list.size > 0 ? Array.from(list) : ['Fresh', 'Perishable', 'General']
  }, [candidateView])

  const availableDistricts = useMemo(() => {
    const list = new Set<string>()
    candidateView?.unassignedOrders?.forEach((o) => { if (o.order?.district) list.add(o.order.district) })
    candidateView?.trips?.forEach((t) => { if (t.district) list.add(t.district) })
    return list.size > 0 ? Array.from(list) : ['Colombo', 'Gampaha', 'Kalutara']
  }, [candidateView])

  function handleOpenDrawer(v: VehicleAllocationCard) {
    setSelectedVehicleId(v.id)
    setDrawerOpen(true)
  }

  function handleOpenSwapModal(v: VehicleAllocationCard) {
    setSelectedVehicleId(v.id)
    setTargetSwapId(null)
    setTargetSwapSlot(v.tripIndex ?? 1)
    setChangeModalOpen(true)
  }

  async function handleConfirmSwap() {
    if (!activeVehicle || !targetSwapId) return
    setIsSubmitting(true)
    try {
      if (activeVehicle.tripId && onApplyCommand && candidateView?.plan.lockVersion !== undefined) {
        const saved = await onApplyCommand({
          operation: 'vehicle',
          tripId: activeVehicle.tripId,
          body: {
            expectedVersion: candidateView.plan.lockVersion,
            reason: reason.trim() || `Switch vehicle to ${targetSwapId} slot ${targetSwapSlot}`,
            vehicleId: targetSwapId,
            tripIndex: targetSwapSlot,
          },
        })
      if (saved === false) return
      } else if (onChangeVehicle) {
        onChangeVehicle(activeVehicle.id, targetSwapId)
      }
      setChangeModalOpen(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleMoveStopEarlier(tripId: number, stopIdx: number) {
    if (!candidateView || candidateView.plan.lockVersion === undefined || !onApplyCommand) return
    const trip = candidateView.trips?.find((t) => t.id === tripId)
    if (!trip || !trip.stops) return
    const orderIds = trip.stops.map((s) => s.orderId!).filter(Boolean)
    if (stopIdx <= 0 || stopIdx >= orderIds.length) return
    ;[orderIds[stopIdx - 1], orderIds[stopIdx]] = [orderIds[stopIdx], orderIds[stopIdx - 1]]
    setIsSubmitting(true)
    try {
      const saved = await onApplyCommand({
        operation: 'sequence',
        tripId,
        body: {
          expectedVersion: candidateView.plan.lockVersion,
          reason: reason.trim() || `Resequence stop earlier in trip ${tripId}`,
          orderIds,
        },
      })
      if (saved === false) return
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleMoveStopLater(tripId: number, stopIdx: number) {
    if (!candidateView || candidateView.plan.lockVersion === undefined || !onApplyCommand) return
    const trip = candidateView.trips?.find((t) => t.id === tripId)
    if (!trip || !trip.stops) return
    const orderIds = trip.stops.map((s) => s.orderId!).filter(Boolean)
    if (stopIdx < 0 || stopIdx >= orderIds.length - 1) return
    ;[orderIds[stopIdx], orderIds[stopIdx + 1]] = [orderIds[stopIdx + 1], orderIds[stopIdx]]
    setIsSubmitting(true)
    try {
      const saved = await onApplyCommand({
        operation: 'sequence',
        tripId,
        body: {
          expectedVersion: candidateView.plan.lockVersion,
          reason: reason.trim() || `Resequence stop later in trip ${tripId}`,
          orderIds,
        },
      })
      if (saved === false) return
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRemoveStop(tripId: number, orderId?: number) {
    if (!orderId || !candidateView || candidateView.plan.lockVersion === undefined || !onApplyCommand) return
    setIsSubmitting(true)
    try {
      const saved = await onApplyCommand({
        operation: 'move',
        body: {
          expectedVersion: candidateView.plan.lockVersion,
          reason: reason.trim() || `Unassign order ${orderId} from trip ${tripId}`,
          orderId,
          fromTripId: tripId,
        },
      })
      if (saved === false) return
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleAssignOrderToTrip(tripId: number, orderId: number) {
    if (!orderId || !candidateView || candidateView.plan.lockVersion === undefined || !onApplyCommand) return
    setIsSubmitting(true)
    try {
      const saved = await onApplyCommand({
        operation: 'move',
        body: {
          expectedVersion: candidateView.plan.lockVersion,
          reason: reason.trim() || `Assign order ${orderId} to trip ${tripId}`,
          orderId,
          toTripId: tripId,
        },
      })
      if (saved === false) return
      setAssignTargetOrderId('')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleAddTrip(e: FormEvent) {
    e.preventDefault()
    if (!newTripVehicle || !candidateView || candidateView.plan.lockVersion === undefined || !onApplyCommand) return
    setIsSubmitting(true)
    try {
      const saved = await onApplyCommand({
        operation: 'addTrip',
        body: {
          expectedVersion: candidateView.plan.lockVersion,
          reason: reason.trim() || `Add trip for vehicle ${newTripVehicle}`,
          trip: {
            vehicleId: newTripVehicle,
            tripIndex: newTripSlot,
            brand: newTripBrand || availableBrands[0] || 'Fresh',
            district: newTripDistrict || availableDistricts[0] || 'Colombo',
            orderIds: [],
          },
        },
      })
      if (saved === false) return
      setAddTripModalOpen(false)
      setNewTripVehicle('')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRemoveTrip(tripId: number) {
    if (!candidateView || candidateView.plan.lockVersion === undefined || !onApplyCommand) return
    setIsSubmitting(true)
    try {
      const saved = await onApplyCommand({
        operation: 'removeTrip',
        tripId,
        body: {
          expectedVersion: candidateView.plan.lockVersion,
          reason: reason.trim() || `Remove trip ${tripId}`,
        },
      })
      if (saved === false) return
    } finally {
      setIsSubmitting(false)
    }
  }

  // Compatible swap options from real reference fleet
  const compatibleVehicles = useMemo(() => {
    if (!activeVehicle) return []
    const fleetList = candidateView?.fleet?.map((f) => ({
      vehicleId: f.vehicleId!,
      temp: f.temp,
      volumeCapM3: f.volumeCapM3 ?? realVehicles.find((r) => r.vehicleId === f.vehicleId)?.volumeCapM3 ?? 0,
      weightCapKg: f.weightCapKg ?? realVehicles.find((r) => r.vehicleId === f.vehicleId)?.weightCapKg ?? 0,
    })) ?? realVehicles
    return fleetList.filter((v) => v.vehicleId !== activeVehicle.id)
  }, [candidateView?.fleet, realVehicles, activeVehicle])

  function cycleSort() {
    setSortBy((prev) => {
      if (prev === 'utilisation') return 'id'
      if (prev === 'id') return 'capacity'
      return 'utilisation'
    })
  }

  return (
    <div className="planning-step3-container animate-fade-in">
      {/* Main Two-Column Layout Matching Figma Frame 3A */}
      <div className="step3-grid">
        {/* Left Column: Vehicles List & Utilization Cards */}
        <div className="step3-left-card">
          {/* Header Row: Count & Sort */}
          <div className="step3-list-toolbar">
            <div className="step3-veh-count-row">
              <span className="step3-veh-title">Vehicles</span>
              <span className="step3-veh-count-badge">{displayVehicles.length}</span>
            </div>

            <button
              type="button"
              className="step3-sort-dropdown"
              onClick={cycleSort}
              title="Click to toggle vehicle sort"
            >
              <span>Sort: {sortBy}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>

            {candidateView && onApplyCommand && !isLocked && (
              <button
                type="button"
                className="toolbar-btn small"
                disabled={blocked}
                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => setAddTripModalOpen(true)}
              >
                <Plus size={14} aria-hidden="true" />
                <span>Add Trip</span>
              </button>
            )}
          </div>

          {/* Reason & Authoritative Status Bar */}
          {candidateView && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '8px 12px', background: '#f8fafc', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid #e2e8f0', fontSize: '12px' }}>
              <span style={{ fontWeight: '600', color: 'var(--color-text-secondary)' }}>Edit reason:</span>
              <input
                type="text"
                className="field-input"
                style={{ flex: 1, padding: '4px 8px', height: '28px', fontSize: '12px' }}
                value={reason}
                disabled={blocked}
                placeholder="Reason for changes (required)"
                onChange={(e) => onReasonChange?.(e.target.value)}
              />
              {onReloadPlan && (
                <button type="button" className="toolbar-btn small" onClick={onReloadPlan} title="Reload authoritative plan state">
                  <RotateCcw size={12} aria-hidden="true" />
                  <span>Reload</span>
                </button>
              )}
            </div>
          )}

          {/* Failure & Violations Alert */}
          {failure && (
            <div style={{ marginBottom: '12px' }}>
              <ErrorState
                error={failure}
                message={failure.message}
                traceId={failure instanceof ManualPlanRequestError ? failure.traceId : undefined}
                onRetry={onReloadPlan}
              />
              {failure instanceof ManualPlanRequestError && failure.violations.length > 0 && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {failure.violations.map((v, i) => (
                    <ViolationCard
                      key={`${v.ruleCode}-${i}`}
                      violation={{
                        ruleCode: v.ruleCode ?? 'RULE_VIOLATION',
                        message: v.message ?? 'Constraint violation',
                        severity: v.severity === 'INFO' ? 'INFO' : 'HARD',
                        actualValue: v.actualValue,
                        allowedValue: v.allowedValue,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Filter Pills matching Figma */}
          <div className="step3-filter-pills" role="tablist" aria-label="Vehicle type filters">
            <button
              type="button"
              className={`step3-filter-pill ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              <span>All</span>
              <span className="step3-pill-count">{displayVehicles.length}</span>
            </button>
            <button
              type="button"
              className={`step3-filter-pill ${activeTab === 'lorry' ? 'active' : ''}`}
              onClick={() => setActiveTab('lorry')}
            >
              <span>Lorry</span>
              <span className="step3-pill-count">{lorryCount}</span>
            </button>
            <button
              type="button"
              className={`step3-filter-pill ${activeTab === 'reefer' ? 'active' : ''}`}
              onClick={() => setActiveTab('reefer')}
            >
              <span>Reefer</span>
              <span className="step3-pill-count">{reeferCount}</span>
            </button>
            <button
              type="button"
              className={`step3-filter-pill ${activeTab === 'van' ? 'active' : ''}`}
              onClick={() => setActiveTab('van')}
            >
              <span>Van</span>
              <span className="step3-pill-count">{vanCount}</span>
            </button>
          </div>

          {/* Scrollable Vehicle Cards List */}
          <div className="step3-vehicle-cards-list">
            {processedVehicles.length === 0 ? (
              <div style={{ background: '#ffffff', padding: 'var(--space-20)', borderRadius: 'var(--radius-md)' }}>
                <EmptyState
                  title="No vehicles in this category"
                  description={`No vehicles matching "${activeTab}" found for ${activeDepot} depot.`}
                />
              </div>
            ) : (
              processedVehicles.map((v) => {
                const isSelected = activeVehicle?.id === v.id
                const volPct = Math.min(100, Math.round((v.volume.used / (v.volume.total || 1)) * 100))
                const wtPct = Math.min(100, Math.round((v.weight.used / (v.weight.total || 1)) * 100))
                const timePct = v.time ? Math.min(100, Math.round((v.time.used / (v.time.total || 1)) * 100)) : 0

                return (
                  <div
                    key={v.id}
                    className={`veh-alloc-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedVehicleId(v.id)}
                  >
                    {/* Left vertical color accent bar */}
                    <div
                      className="veh-card-accent-bar"
                      style={{ background: isSelected ? 'var(--color-brand-primary)' : v.accentColor }}
                    />

                    <div className="veh-card-body">
                      {/* Top Row: Vehicle ID, Badge, Trip count summary, and Action buttons */}
                      <div className="veh-card-head">
                        <div className="veh-card-title-group">
                          <span className="veh-card-id">{v.id}</span>
                          <span className={`veh-card-type-tag badge-${v.badge.toLowerCase()}`}>
                            {v.type}
                          </span>
                        </div>

                        <div className="veh-card-meta-right">
                          <span className="veh-card-trips-summary">
                            {v.tripsSummary ?? (v.stops && v.stops.length > 0 ? `${v.stops.length} stops` : 'Standby')}
                          </span>
                          <div className="veh-card-action-btns">
                            <button
                              type="button"
                              className="card-action-btn"
                              title="Review stops and timeline"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpenDrawer(v)
                              }}
                            >
                              Review
                            </button>
                            <button
                              type="button"
                              className="card-action-btn"
                              title="Change or reassign vehicle"
                              disabled={blocked}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpenSwapModal(v)
                              }}
                            >
                              Change
                            </button>
                            {v.tripId && onApplyCommand && !isLocked && (
                              <button
                                type="button"
                                className="card-action-btn"
                                title="Remove trip"
                                disabled={blocked}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void handleRemoveTrip(v.tripId!)
                                }}
                              >
                                <Trash2 size={12} aria-hidden="true" />
                                <span>Remove</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Driver & Territory / Fleet line */}
                      <div className="veh-card-driver">
                        <span>👤</span>
                        <span>{v.driver ? v.driver : 'Unassigned driver'}</span>
                        <span>·</span>
                        <span>{v.region ?? `${activeDepot} Fleet`}</span>
                      </div>

                      {/* Warning banner if any */}
                      {v.warning && (
                        <div className="veh-warning-banner">
                          <AlertTriangle size={13} aria-hidden="true" />
                          <span>{v.warning}</span>
                        </div>
                      )}

                      {/* Trip breakdown chips if trips exist */}
                      {v.trips && v.trips.length > 0 && (
                        <div className="veh-trips-tags">
                          {v.trips.map((trip, idx) => (
                            <div key={idx} className="veh-trip-pill">
                              <strong>{trip.name}:</strong>
                              <span>{trip.tag}</span>
                              <span>({trip.stops} stops)</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 4 Multi-metric progress bars: Volume, Weight, Time, Fuel */}
                      <div className="veh-util-bars">
                        {/* Volume */}
                        <div className="util-row">
                          <span className="util-metric-name">Volume</span>
                          <div className="util-bar-bg">
                            <div className="util-bar-fill blue" style={{ width: `${volPct}%` }} />
                          </div>
                          <span className="util-metric-vals">
                            {v.volume.used} / {v.volume.total} {v.volume.unit}
                          </span>
                        </div>

                        {/* Weight */}
                        <div className="util-row">
                          <span className="util-metric-name">Weight</span>
                          <div className="util-bar-bg">
                            <div className="util-bar-fill purple" style={{ width: `${wtPct}%` }} />
                          </div>
                          <span className="util-metric-vals">
                            {v.weight.used.toLocaleString()} / {v.weight.total.toLocaleString()} {v.weight.unit}
                          </span>
                        </div>

                        {/* Time */}
                        <div className="util-row">
                          <span className="util-metric-name">Time</span>
                          <div className="util-bar-bg">
                            <div className="util-bar-fill green" style={{ width: `${timePct}%` }} />
                          </div>
                          <span className="util-metric-vals">
                            {v.time && v.time.total > 0 ? `${v.time.used} / ${v.time.total} min` : 'Time budget unavailable'}
                          </span>
                        </div>

                        {/* Fuel */}
                        <div className="util-row">
                          <span className="util-metric-name">Fuel</span>
                          <div className="util-bar-bg">
                            <div
                              className="util-bar-fill amber"
                              style={{
                                width: v.fuel && v.fuel.total > 0 ? `${Math.min(100, Math.round((v.fuel.remaining / v.fuel.total) * 100))}%` : '0%',
                              }}
                            />
                          </div>
                          <span className="util-metric-vals">
                            {v.fuel && v.fuel.total > 0 ? `${v.fuel.remaining} / ${v.fuel.total} ${v.fuel.unit}` : 'Fuel quota unavailable'}
                          </span>
                        </div>
                      </div>

                      {/* Fresh Delivery Budget Footer */}
                      {v.freshBudget && (
                        <div className="veh-fresh-budget">
                          <Clock size={11} aria-hidden="true" />
                          <span>Fresh delivery budget: {v.freshBudget}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right Column: Route Inspector with Interactive Leaflet Map */}
        <div className="step3-right-col">
          {activeVehicle && (
            <InteractiveRouteMap
              activeDepot={activeDepot}
              vehicleId={activeVehicle.id}
              vehicleType={activeVehicle.type}
              accentColor={activeVehicle.accentColor}
              stops={activeVehicle.stops}
              allRoutes={allRoutesForMap}
              onViewStops={() => setDrawerOpen(true)}
            />
          )}
        </div>
      </div>

      {/* Slide-out Stops Review Drawer (3C) */}
      {drawerOpen && activeVehicle && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="drawer-panel animate-slide-left" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3 className="drawer-title">{activeVehicle.id} Delivery Sequence</h3>
                <p className="drawer-subtitle">
                  {activeVehicle.type} · {activeVehicle.region}
                </p>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close drawer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="drawer-body" style={{ padding: '16px' }}>
              {activeVehicle.stops && activeVehicle.stops.length > 0 ? (
                <div className="drawer-stops-timeline">
                  {activeVehicle.stops.map((stop, stopIdx) => (
                    <div key={stop.ref} className="drawer-stop-item" style={{ display: 'flex', gap: '12px', marginBottom: '14px', alignItems: 'flex-start' }}>
                      <div className="stop-seq-badge" style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--color-brand-primary)', color: '#000', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', flexShrink: 0 }}>
                        {stop.seq}
                      </div>
                      <div className="stop-info" style={{ flex: 1 }}>
                        <div className="stop-name" style={{ fontWeight: '700', fontSize: '13px', color: 'var(--color-text-primary)' }}>
                          {stop.outletName}
                        </div>
                        <div className="stop-meta" style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', gap: '6px', marginTop: '2px' }}>
                          <span className="stop-ref">{stop.ref}</span>
                          <span>·</span>
                          <span className="stop-window">🕒 Window {stop.window}</span>
                          {stop.plannedArrival && <><span>·</span><span className="stop-arrival">Arrives {stop.plannedArrival}</span></>}
                          <span>·</span>
                          <span className="stop-vol">{stop.volume}</span>
                        </div>
                      </div>
                      {activeVehicle.tripId && onApplyCommand && !isLocked && (
                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                          <button
                            type="button"
                            className="toolbar-btn small"
                            disabled={blocked || stopIdx === 0}
                            style={{ padding: '2px 6px', fontSize: '11px' }}
                            title="Move stop earlier"
                            onClick={() => void handleMoveStopEarlier(activeVehicle.tripId!, stopIdx)}
                          >
                            Earlier
                          </button>
                          <button
                            type="button"
                            className="toolbar-btn small"
                            disabled={blocked || stopIdx === (activeVehicle.stops?.length ?? 1) - 1}
                            style={{ padding: '2px 6px', fontSize: '11px' }}
                            title="Move stop later"
                            onClick={() => void handleMoveStopLater(activeVehicle.tripId!, stopIdx)}
                          >
                            Later
                          </button>
                          <button
                            type="button"
                            className="toolbar-btn small"
                            disabled={blocked}
                            style={{ padding: '2px 6px', fontSize: '11px', color: 'var(--color-danger, #ef4444)' }}
                            title="Remove stop from trip"
                            onClick={() => void handleRemoveStop(activeVehicle.tripId!, stop.orderId)}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No stops allocated"
                  description="When the solver runs or stops are assigned, sequential stops with delivery windows will appear here."
                />
              )}

              {activeVehicle.tripId && candidateView && (candidateView.unassignedOrders?.length ?? 0) > 0 && onApplyCommand && !isLocked && (
                <div style={{ marginTop: '16px', padding: '12px', background: '#f8fafc', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: 'var(--color-text-primary)' }}>
                    Assign Unassigned Order to Trip
                  </h4>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      className="field-select"
                      style={{ flex: 1, fontSize: '12px' }}
                      value={assignTargetOrderId}
                      disabled={blocked}
                      onChange={(e) => setAssignTargetOrderId(e.target.value)}
                    >
                      <option value="">Select unassigned order...</option>
                      {candidateView.unassignedOrders?.map((item) => (
                        <option key={item.order?.id} value={item.order?.id}>
                          {item.order?.orderRef} · {item.order?.outletId} ({item.order?.volumeM3?.toFixed(1) ?? '0.0'} m³)
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-primary-yellow small"
                      disabled={!assignTargetOrderId || blocked}
                      onClick={() => void handleAssignOrderToTrip(activeVehicle.tripId!, Number(assignTargetOrderId))}
                    >
                      Assign
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="drawer-footer" style={{ padding: '16px', borderTop: '1px solid var(--color-border-default)' }}>
              <button
                type="button"
                className="btn-primary-yellow full-width"
                onClick={() => setDrawerOpen(false)}
              >
                Close Sequence Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Vehicle Modal (3D) */}
      {changeModalOpen && activeVehicle && (
        <div className="modal-overlay" onClick={() => setChangeModalOpen(false)}>
          <div className="modal-card animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Change Vehicle for Route</h3>
                <p className="modal-subtitle">
                  Currently assigned: <strong>{activeVehicle.id}</strong> ({activeVehicle.type})
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setChangeModalOpen(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-label" style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
                Select a compatible vehicle from the {activeDepot} fleet:
              </p>
              <div className="swap-options-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {compatibleVehicles.slice(0, 6).map((veh) => {
                  const isChosen = targetSwapId === veh.vehicleId
                  const isReefer = veh.temp?.toLowerCase() === 'reefer'
                  return (
                    <div
                      key={veh.vehicleId}
                      className={`swap-option-card ${isChosen ? 'chosen' : ''}`}
                      onClick={() => setTargetSwapId(veh.vehicleId)}
                      style={{
                        padding: '10px 14px',
                        border: isChosen ? '1.5px solid var(--color-brand-primary)' : '1px solid var(--color-border-default)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        background: isChosen ? '#fffbeb' : '#ffffff',
                      }}
                    >
                      <div className="swap-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="swap-id" style={{ fontWeight: '800', fontFamily: 'var(--font-family-mono)', fontSize: '13px' }}>
                          {veh.vehicleId}
                        </span>
                        <span className={`veh-card-type-tag badge-${isReefer ? 'reefer' : 'lorry'}`}>
                          {isReefer ? 'Reefer' : 'Lorry'}
                        </span>
                        <span className="swap-cap" style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                          Cap: {veh.volumeCapM3} m³ · {veh.weightCapKg} kg
                        </span>
                      </div>
                      <div className="swap-status">
                        {isChosen ? (
                          <span className="swap-selected-mark" style={{ color: '#b45309', fontWeight: '700', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Check size={14} /> Selected
                          </span>
                        ) : (
                          <span className="swap-avail" style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Available</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{ marginTop: '12px' }}>
                <label className="field-label" htmlFor="swap-slot-select" style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                  Trip Slot:
                </label>
                <select
                  id="swap-slot-select"
                  className="field-select full-width"
                  value={targetSwapSlot}
                  onChange={(e) => setTargetSwapSlot(Number(e.target.value))}
                >
                  <option value={1}>Slot 1 (Morning delivery)</option>
                  <option value={2}>Slot 2 (Afternoon delivery)</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => setChangeModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary-yellow"
                disabled={!targetSwapId || blocked}
                onClick={handleConfirmSwap}
              >
                Confirm Vehicle Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Trip Modal */}
      {addTripModalOpen && (
        <div className="modal-overlay" onClick={() => setAddTripModalOpen(false)}>
          <div className="modal-card animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={(e) => void handleAddTrip(e)}>
              <div className="modal-header">
                <div>
                  <h3 className="modal-title">Add Vehicle Trip</h3>
                  <p className="modal-subtitle">{activeDepot} Depot · Manual Allocation</p>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setAddTripModalOpen(false)}
                  aria-label="Close modal"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label className="field-label" htmlFor="new-trip-veh">Vehicle:</label>
                  <select
                    id="new-trip-veh"
                    className="field-select full-width"
                    required
                    value={newTripVehicle}
                    onChange={(e) => setNewTripVehicle(e.target.value)}
                  >
                    <option value="">Select vehicle...</option>
                    {(candidateView?.fleet ?? realVehicles).map((veh) => (
                      <option key={veh.vehicleId} value={veh.vehicleId}>
                        {veh.vehicleId} · {veh.temp ?? 'Ambient'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="new-trip-slot">Trip Slot:</label>
                  <select
                    id="new-trip-slot"
                    className="field-select full-width"
                    value={newTripSlot}
                    onChange={(e) => setNewTripSlot(Number(e.target.value))}
                  >
                    <option value={1}>Slot 1 (Morning)</option>
                    <option value={2}>Slot 2 (Afternoon)</option>
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="new-trip-brand">Brand:</label>
                  <select
                    id="new-trip-brand"
                    className="field-select full-width"
                    value={newTripBrand || availableBrands[0]}
                    onChange={(e) => setNewTripBrand(e.target.value)}
                  >
                    {availableBrands.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="new-trip-dist">District:</label>
                  <select
                    id="new-trip-dist"
                    className="field-select full-width"
                    value={newTripDistrict || availableDistricts[0]}
                    onChange={(e) => setNewTripDistrict(e.target.value)}
                  >
                    {availableDistricts.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => setAddTripModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary-yellow"
                  disabled={!newTripVehicle || blocked}
                >
                  Create Trip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sticky Bottom Bar Matching Figma 3A */}
      <div className="planning-bottom-bar">
        <div className="bottom-bar-left">
          <div style={{ color: 'var(--color-brand-primary)', display: 'flex', alignItems: 'center' }}>
            <Info size={18} aria-hidden="true" />
          </div>
          <div>
            <div className="bottom-bar-metric">
              {totalOrdersPlaced > 0
                ? `${totalOrdersPlaced} orders allocated across ${allocatedVehiclesCount || displayVehicles.length} vehicles`
                : `${displayVehicles.length} vehicles available`}
            </div>
            <div className="bottom-bar-sub">
              {totalOrdersPlaced > 0
                ? 'Review allocations or proceed to triage exceptions'
                : `Standby at ${activeDepot} Depot · Ready for routes`}
            </div>
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
            className="btn-generate-plan"
            aria-label="Proceed to exceptions"
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

/** Formats the effective window supplied by the backend; never substitutes an invented window. */
export function formatDeliveryWindow(open?: string | null, close?: string | null) {
  return open && close ? `${open.slice(0, 5)}–${close.slice(0, 5)}` : 'unavailable'
}
