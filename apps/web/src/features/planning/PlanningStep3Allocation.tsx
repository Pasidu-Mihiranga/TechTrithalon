import { useState, useMemo } from 'react'
import type { FormEvent } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Clock,
  Info,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { useVehicles } from '../../lib/referenceQueries'
import { Button, Dialog, EmptyState, ErrorState, Select, ViolationCard } from '../../components'
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
  /** Server-computed service start; later than the arrival when the stop waits for its window. */
  serviceStart?: string
  dockType?: string
  parkingConstraint?: string
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
  /** Server-computed trip facts (candidate trips only). */
  tripMinutes?: number
  distanceKm?: number
  fuelLitres?: number
  /** Which daily budget the time bar is measured against. */
  budgetLabel?: string
  availabilityStatus?: string | null
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
  /** Per-card expand/collapse; by default cards with a trip are open and standby vehicles are folded. */
  const [expandedOverride, setExpandedOverride] = useState<Record<string, boolean>>({})
  const isExpanded = (v: VehicleAllocationCard) => expandedOverride[v.id] ?? Boolean(v.tripId)
  const toggleExpanded = (v: VehicleAllocationCard) => setExpandedOverride(prev => ({ ...prev, [v.id]: !isExpanded(v) }))
  const [newTripSlot, setNewTripSlot] = useState(1)
  const [newTripBrand, setNewTripBrand] = useState('')
  const [newTripDistrict, setNewTripDistrict] = useState('')
  const [assignTargetOrderId, setAssignTargetOrderId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch real reference vehicles from backend database
  const vehiclesQuery = useVehicles()
  const realVehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data])

  const isLocked = candidateView != null && candidateView.plan.status !== 'candidate'
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
        const isVan = (fleetVeh?.type ?? refVeh?.type)?.toLowerCase() === 'van'
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
          tripsSummary: `Trip ${trip.tripIndex ?? 1} · ${plural(trip.stops?.length ?? 0, 'stop')} · ${trip.tripMinutes ?? '—'} min · ${trip.distanceKm ?? '—'} km`,
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
          tripMinutes: trip.tripMinutes,
          distanceKm: trip.distanceKm,
          fuelLitres: trip.fuelLitres,
          budgetLabel: fresh ? 'Fresh budget, vehicle day' : 'Style/Tech budget, vehicle day',
          availabilityStatus: fleetVeh?.availabilityStatus,
          stops: (trip.stops ?? []).map((s, sIdx) => ({
            seq: s.stopIndex ?? sIdx + 1,
            ref: s.order?.orderRef ?? `ORD-${s.orderId}`,
            outletName: s.order ? `${s.order.outletId} · ${s.order.district ?? 'district unavailable'}` : `Order ${s.orderId}`,
            window: formatDeliveryWindow(s.order?.effectiveWindowOpen, s.order?.effectiveWindowClose),
            plannedArrival: s.plannedArrival ? s.plannedArrival.slice(0, 5) : undefined,
            serviceStart: s.serviceStart ? s.serviceStart.slice(0, 5) : undefined,
            dockType: s.order?.dockType,
            parkingConstraint: s.order?.parkingConstraint,
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
          const isVan = (veh.type ?? refVeh?.type)?.toLowerCase() === 'van'
          const badge: 'Reefer' | 'Lorry' | 'Van' = isReefer ? 'Reefer' : isVan ? 'Van' : 'Lorry'
          cards.push({
            id: veh.vehicleId ?? `VEH-${idx}`,
            vehicleId: veh.vehicleId,
            type: `${badge} (Standby)`,
            badge,
            driver: undefined,
            region: `${activeDepot} Fleet`,
            tripsSummary: 'No trip yet',
            availabilityStatus: veh.availabilityStatus,
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

  const availableBrands = useMemo(() => {
    const list = new Set<string>()
    candidateView?.unassignedOrders?.forEach((o) => { if (o.order?.brand) list.add(o.order.brand) })
    candidateView?.trips?.forEach((t) => { if (t.brand) list.add(t.brand) })
    return list.size > 0 ? Array.from(list) : ['Fresh', 'Style', 'Tech']
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
    if (!v.tripId) return // a vehicle without a trip has nothing to change
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

  function openAddTrip(vehicleId?: string) {
    setNewTripVehicle(vehicleId ?? '')
    setAddTripModalOpen(true)
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
  const compatibleVehicles = useMemo<SwapOption[]>(() => {
    if (!activeVehicle) return []
    const fleetList = candidateView?.fleet?.map((f) => ({
      vehicleId: f.vehicleId!,
      temp: f.temp,
      volumeCapM3: f.volumeCapM3 ?? realVehicles.find((r) => r.vehicleId === f.vehicleId)?.volumeCapM3 ?? 0,
      weightCapKg: f.weightCapKg ?? realVehicles.find((r) => r.vehicleId === f.vehicleId)?.weightCapKg ?? 0,
      type: f.type,
      availabilityStatus: f.availabilityStatus,
    })) ?? realVehicles
    // Vehicles that can actually be chosen come first; the rest stay visible with their status.
    return (fleetList as SwapOption[]).filter((v) => v.vehicleId !== activeVehicle.id)
      .sort((a, b) => Number(b.availabilityStatus === 'available') - Number(a.availabilityStatus === 'available')
        || a.vehicleId.localeCompare(b.vehicleId))
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
                onClick={() => openAddTrip()}
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
          {failure && <PlanFailure failure={failure} onRetry={onReloadPlan} />}

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
              processedVehicles.map((v) => (
                <VehicleCard
                  key={v.id}
                  vehicle={v}
                  selected={activeVehicle?.id === v.id}
                  expanded={isExpanded(v)}
                  canEdit={Boolean(candidateView && onApplyCommand && !isLocked)}
                  blocked={blocked}
                  activeDepot={activeDepot}
                  onSelect={() => setSelectedVehicleId(v.id)}
                  onToggle={() => toggleExpanded(v)}
                  onReview={() => handleOpenDrawer(v)}
                  onChange={() => handleOpenSwapModal(v)}
                  onRemove={() => { if (v.tripId) void handleRemoveTrip(v.tripId) }}
                  onAddTrip={() => openAddTrip(v.vehicleId ?? v.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right Column: Route Inspector with Interactive Leaflet Map */}
        <div className="step3-right-col">
          {activeVehicle && (
            <InteractiveRouteMap
              activeDepot={activeDepot}
              vehicle={activeVehicle}
              onViewStops={() => setDrawerOpen(true)}
              allCards={displayVehicles}
              unassignedByDistrict={candidateView?.unassignedByDistrict}
              onSelectVehicle={setSelectedVehicleId}
              onAddTrip={candidateView && onApplyCommand && !isLocked ? () => openAddTrip(activeVehicle.vehicleId ?? activeVehicle.id) : undefined}
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

      {/* Change Vehicle Dialog (3D) */}
      {changeModalOpen && activeVehicle && (
        <ChangeVehicleDialog
          vehicle={activeVehicle}
          options={compatibleVehicles}
          chosen={targetSwapId}
          slot={targetSwapSlot}
          submitting={isSubmitting}
          failure={failure}
          onChoose={setTargetSwapId}
          onSlot={setTargetSwapSlot}
          onConfirm={() => void handleConfirmSwap()}
          onClose={() => setChangeModalOpen(false)}
        />
      )}

      {/* Add Trip Dialog */}
      <Dialog
        open={addTripModalOpen}
        title="Add Vehicle Trip"
        onClose={() => setAddTripModalOpen(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setAddTripModalOpen(false)}>Cancel</Button>
          <Button type="submit" form="add-trip-form" disabled={!newTripVehicle || blocked} loading={isSubmitting}>Create Trip</Button>
        </>}
      >
        <form id="add-trip-form" className="swap-body" onSubmit={(e) => void handleAddTrip(e)}>
          <p className="swap-current">{activeDepot} Depot · the server validates the trip when its first order is assigned.</p>
          <Select label="Vehicle" required placeholder="Select vehicle" value={newTripVehicle} onChange={(e) => setNewTripVehicle(e.target.value)}
            options={(candidateView?.fleet ?? realVehicles).map((veh) => ({
              value: veh.vehicleId!,
              label: `${veh.vehicleId} · ${veh.temp ?? 'temperature unrecorded'} ${veh.type ?? ''}${'availabilityStatus' in veh && veh.availabilityStatus ? ` · ${availabilityLabel(veh.availabilityStatus)}` : ''}`,
            }))} />
          <Select label="Trip slot" value={String(newTripSlot)} onChange={(e) => setNewTripSlot(Number(e.target.value))}
            options={[{ value: '1', label: 'Trip 1' }, { value: '2', label: 'Trip 2' }]} />
          <Select label="Brand" value={newTripBrand || availableBrands[0]} onChange={(e) => setNewTripBrand(e.target.value)}
            options={availableBrands.map((b) => ({ value: b, label: b }))} />
          <Select label="District" value={newTripDistrict || availableDistricts[0]} onChange={(e) => setNewTripDistrict(e.target.value)}
            options={availableDistricts.map((d) => ({ value: d, label: d }))} />
          {failure && <PlanFailure failure={failure} />}
        </form>
      </Dialog>

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

/** A rejected edit: the backend's message, trace ID and every named rule violation. */
function PlanFailure({ failure, onRetry }: { failure: Error; onRetry?: () => void }) {
  return (
    <div className="plan-failure">
      <ErrorState
        error={failure}
        message={failure.message}
        traceId={failure instanceof ManualPlanRequestError ? failure.traceId : undefined}
        onRetry={onRetry}
      />
      {failure instanceof ManualPlanRequestError && failure.violations.length > 0 && (
        <div className="plan-failure-list">
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
  )
}

interface SwapOption {
  vehicleId: string
  temp?: string
  type?: string
  volumeCapM3?: number
  weightCapKg?: number
  availabilityStatus?: string | null
}

/** Change the vehicle (and slot) of an existing trip. The server validates the swap and names any rule it breaks. */
function ChangeVehicleDialog({ vehicle, options, chosen, slot, submitting, failure, onChoose, onSlot, onConfirm, onClose }: {
  vehicle: VehicleAllocationCard
  options: SwapOption[]
  chosen: string | null
  slot: number
  submitting: boolean
  failure?: Error | null
  onChoose: (vehicleId: string) => void
  onSlot: (slot: number) => void
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog
      open
      title="Change Vehicle for Route"
      onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={!chosen} loading={submitting} onClick={onConfirm}>Confirm Vehicle Switch</Button>
      </>}
    >
      <div className="swap-body">
      <p className="swap-current">Currently assigned: <strong>{vehicle.id}</strong> ({vehicle.type})</p>
      <fieldset className="swap-fieldset">
        <legend className="field-label">Choose a vehicle from the depot fleet</legend>
        {options.length === 0
          ? <p className="field-hint">No other vehicle is in this depot's fleet.</p>
          : <div className="swap-list">
            {options.map(option => {
              const available = option.availabilityStatus === 'available'
              return (
                <label key={option.vehicleId} className={`swap-option${chosen === option.vehicleId ? ' chosen' : ''}${available ? '' : ' unavailable'}`}>
                  <input type="radio" name="swap-vehicle" value={option.vehicleId} checked={chosen === option.vehicleId}
                    disabled={!available} onChange={() => onChoose(option.vehicleId)} />
                  <span className="swap-id">{option.vehicleId}</span>
                  <span className="swap-kind">{swapKind(option)}</span>
                  <span className="swap-cap">{option.volumeCapM3 ?? '—'} m³ · {option.weightCapKg ?? '—'} kg</span>
                  <span className="swap-status">{availabilityLabel(option.availabilityStatus)}</span>
                </label>
              )
            })}
          </div>}
      </fieldset>
      <Select label="Trip slot" value={String(slot)} onChange={event => onSlot(Number(event.target.value))}
        options={[{ value: '1', label: 'Trip 1' }, { value: '2', label: 'Trip 2' }]} />
      {failure && <PlanFailure failure={failure} />}
      </div>
    </Dialog>
  )
}

function swapKind(option: SwapOption) {
  if (option.temp?.toLowerCase() === 'reefer') return 'Reefer'
  return option.type?.toLowerCase() === 'van' ? 'Van' : 'Lorry'
}

function availabilityLabel(status?: string | null) {
  if (!status) return 'Availability not recorded'
  return status.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase())
}

const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
const fmt = (value: number) => numberFormat.format(value)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const percent = (used: number, total: number) => (total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0)

/** One readable measure: a large value, its limit, an optional bar and a short note. */
function MetricTile({ label, value, total, pct, note, tone }: {
  label: string; value: string; total?: string; pct?: number; note?: string; tone: 'blue' | 'purple' | 'green' | 'amber'
}) {
  return (
    <div className="metric-tile">
      <span className="metric-tile-label">{label}</span>
      <span className="metric-tile-value">{value}{total && <span className="metric-tile-total"> of {total}</span>}</span>
      {pct !== undefined && (
        <div className="metric-tile-bar" role="progressbar" aria-label={`${label} used`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`metric-tile-fill ${tone}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {note && <span className="metric-tile-note">{note}</span>}
    </div>
  )
}

/** A vehicle in the allocation list. The header stays visible; the details fold away. */
function VehicleCard({ vehicle: v, selected, expanded, canEdit, blocked, activeDepot, onSelect, onToggle, onReview, onChange, onRemove, onAddTrip }: {
  vehicle: VehicleAllocationCard
  selected: boolean
  expanded: boolean
  canEdit: boolean
  blocked: boolean
  activeDepot: string
  onSelect: () => void
  onToggle: () => void
  onReview: () => void
  onChange: () => void
  onRemove: () => void
  onAddTrip: () => void
}) {
  const detailId = `vehicle-detail-${v.id}`
  const hasTrip = Boolean(v.tripId)
  const stop = (action: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); action() }
  return (
    <article className={`veh-alloc-card${selected ? ' selected' : ''}${expanded ? '' : ' collapsed'}`} onClick={onSelect} aria-label={`Vehicle ${v.id}`}>
      <div className="veh-card-accent-bar" style={{ background: selected ? 'var(--color-brand-primary)' : v.accentColor }} />
      <div className="veh-card-body">
        <div className="veh-card-head">
          <button type="button" className="veh-card-toggle" aria-expanded={expanded} aria-controls={detailId}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${v.id}`} onClick={stop(onToggle)}>
            <ChevronDown size={16} aria-hidden="true" className={expanded ? 'veh-card-chevron open' : 'veh-card-chevron'} />
            <span className="veh-card-id">{v.id}</span>
          </button>
          <span className={`veh-card-type-tag badge-${v.badge.toLowerCase()}`}>{v.type}</span>
          <span className="veh-card-trips-summary">{v.tripsSummary ?? (hasTrip ? `${v.stops?.length ?? 0} stops` : 'No trip yet')}</span>
        </div>

        <div className="veh-card-action-btns">
          <button type="button" className="card-action-btn" title="Review stops and timeline" onClick={stop(onReview)}>Review</button>
          {hasTrip && canEdit && (
            <>
              <button type="button" className="card-action-btn" title="Change the vehicle or slot of this trip" disabled={blocked} onClick={stop(onChange)}>Change</button>
              <button type="button" className="card-action-btn" title="Remove trip" disabled={blocked} onClick={stop(onRemove)}>
                <Trash2 size={12} aria-hidden="true" /><span>Remove</span>
              </button>
            </>
          )}
          {!hasTrip && canEdit && (
            <button type="button" className="card-action-btn primary" title={`Create a trip for ${v.id}`} disabled={blocked} onClick={stop(onAddTrip)}>Add trip</button>
          )}
          {!canEdit && <span className="veh-card-hint">Open a candidate plan to edit trips</span>}
        </div>

        {expanded && (
          <div id={detailId} className="veh-card-detail">
            <div className="veh-card-driver">
              <span aria-hidden="true">👤</span>
              <span>{v.driver ? v.driver : 'Driver assigned at publication'}</span>
              <span aria-hidden="true">·</span>
              <span>{v.region ?? `${activeDepot} Fleet`}</span>
              {v.availabilityStatus !== undefined && <><span aria-hidden="true">·</span><span>{availabilityLabel(v.availabilityStatus)}</span></>}
            </div>
            {v.warning && (
              <div className="veh-warning-banner"><AlertTriangle size={13} aria-hidden="true" /><span>{v.warning}</span></div>
            )}
            {v.trips && v.trips.length > 0 && (
              <div className="veh-trips-tags">
                {v.trips.map((trip, idx) => (
                  <div key={idx} className="veh-trip-pill"><strong>{trip.name}:</strong><span>{trip.tag}</span><span>({plural(trip.stops, 'stop')})</span></div>
                ))}
              </div>
            )}
            <div className="metric-tiles">
              <MetricTile label="Volume" tone="blue" value={`${fmt(v.volume.used)} m³`}
                total={v.volume.total > 0 ? `${fmt(v.volume.total)} m³` : 'capacity unrecorded'} pct={percent(v.volume.used, v.volume.total)} />
              <MetricTile label="Weight" tone="purple" value={`${fmt(v.weight.used)} kg`}
                total={v.weight.total > 0 ? `${fmt(v.weight.total)} kg` : 'capacity unrecorded'} pct={percent(v.weight.used, v.weight.total)} />
              {hasTrip && v.time && v.time.total > 0
                ? <MetricTile label="Time" tone="green" value={`${fmt(v.time.used)} min`} total={`${fmt(v.time.total)} min`}
                    pct={percent(v.time.used, v.time.total)} note={v.budgetLabel} />
                : <MetricTile label="Time" tone="green" value="No trip yet" note="Budget applies once a trip exists" />}
              {hasTrip && v.fuel && v.fuel.total > 0
                ? <MetricTile label="Fuel" tone="amber" value={`${fmt(v.fuelLitres ?? v.fuel.remaining)} L`} total={`${fmt(v.fuel.total)} L weekly quota`}
                    pct={percent(v.fuelLitres ?? v.fuel.remaining, v.fuel.total)} note="This trip" />
                : <MetricTile label="Fuel" tone="amber" value={v.fuel && v.fuel.total > 0 ? `${fmt(v.fuel.total)} L` : 'Unrecorded'} note="Weekly quota" />}
            </div>
            {v.freshBudget && (
              <div className="veh-fresh-budget"><Clock size={11} aria-hidden="true" /><span>Fresh delivery budget: {v.freshBudget}</span></div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
