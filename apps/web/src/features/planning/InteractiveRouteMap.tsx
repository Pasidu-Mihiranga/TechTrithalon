import { useMemo } from 'react'
import { Button, DistrictMap, ErrorState, LoadingState } from '../../components'
import { useGeography } from '../../lib/referenceQueries'
import type { VehicleAllocationCard } from './PlanningStep3Allocation'

export interface InteractiveRouteMapProps {
  activeDepot: string
  vehicle: VehicleAllocationCard
  onViewStops?: () => void
  /** Present only while the candidate can be edited. */
  onAddTrip?: () => void
  /** Every card in the plan, so the map can show where trips run. */
  allCards?: VehicleAllocationCard[]
  /** Orders still on no trip, counted per district by the server. */
  unassignedByDistrict?: Record<string, number>
  onSelectVehicle?: (vehicleCardId: string) => void
}

/**
 * Route detail for the selected vehicle. The competition data has no outlet or depot coordinates,
 * so this is a schematic stop sequence built from the server's schedule, never a geographic map.
 */
export function InteractiveRouteMap({ activeDepot, vehicle: v, onViewStops, onAddTrip, allCards = [], unassignedByDistrict = {}, onSelectVehicle }: InteractiveRouteMapProps) {
  const stops = v.stops ?? []
  const geography = useGeography()
  const trips = useMemo(() => allCards.filter(card => card.tripId && card.district), [allCards])
  const badges = useMemo(() => {
    const result: Record<string, string> = {}
    for (const district of new Set([...trips.map(t => t.district!), ...Object.keys(unassignedByDistrict)])) {
      const left = unassignedByDistrict[district] ?? 0
      result[district] = left > 0 ? `${left} left` : 'all assigned'
    }
    return result
  }, [trips, unassignedByDistrict])
  const details = useMemo(() => {
    const result: Record<string, string[]> = {}
    for (const district of Object.keys(badges)) {
      const here = trips.filter(t => t.district === district)
      result[district] = [
        `${unassignedByDistrict[district] ?? 0} orders not yet on a trip`,
        ...here.map(t => `${t.vehicleId ?? t.id} · Trip ${t.tripIndex ?? 1} · ${t.stops?.length ?? 0} stops · ${t.tripMinutes ?? '—'} min`),
        here.length > 0 ? 'Click to select a trip here' : 'No trip yet',
      ]
    }
    return result
  }, [badges, trips, unassignedByDistrict])
  const selectedDistrict = v.district ?? null
  return (
    <section className="route-panel" aria-label={`Route detail for ${v.id}`}>
      {geography.isPending && <LoadingState rows={2} label="Loading district map" />}
      {geography.isError && <ErrorState error={geography.error} message="The district map could not be loaded." onRetry={() => void geography.refetch()} />}
      {geography.data && (
        <DistrictMap geography={geography.data} values={unassignedByDistrict} badges={badges} details={details}
          legend="Orders not yet on a trip" depot={activeDepot} selected={selectedDistrict} emphasised={selectedDistrict ? [selectedDistrict] : undefined}
          label="Trips and unassigned orders by district" height={420}
          onSelect={district => {
            const first = district ? trips.find(t => t.district === district) : undefined
            if (first && onSelectVehicle) onSelectVehicle(first.id)
          }} />
      )}
      <header className="route-panel-head">
        <div>
          <h2 className="text-heading-s">{v.id}{v.tripIndex ? ` · Trip ${v.tripIndex}` : ''}</h2>
          <p className="route-panel-sub">
            {v.tripId ? `${v.brand ?? ''} · ${v.district ?? ''} · ${v.driver ?? 'Driver assigned at publication'}` : `${v.type} · ${activeDepot} depot`}
          </p>
        </div>
        {v.tripId && onViewStops && <Button variant="secondary" onClick={onViewStops}>Edit stop order</Button>}
      </header>

      {!v.tripId ? (
        <div className="route-panel-empty">
          <p><strong>No trip yet.</strong> This vehicle has no stops in the candidate plan.</p>
          <dl className="route-facts">
            <div><dt>Capacity</dt><dd>{v.volume.total > 0 ? `${v.volume.total} m³ · ${v.weight.total.toLocaleString()} kg` : 'Unrecorded'}</dd></div>
            <div><dt>Weekly fuel quota</dt><dd>{v.fuel && v.fuel.total > 0 ? `${v.fuel.total} L` : 'Unrecorded'}</dd></div>
            <div><dt>Availability</dt><dd>{v.availabilityStatus ? v.availabilityStatus.replaceAll('_', ' ') : 'Not recorded'}</dd></div>
          </dl>
          {onAddTrip && <Button onClick={onAddTrip}>Add trip for {v.id}</Button>}
        </div>
      ) : (
        <>
          <dl className="route-facts">
            <div><dt>Trip time</dt><dd>{v.tripMinutes ?? '—'} min</dd></div>
            <div><dt>Distance</dt><dd>{v.distanceKm ?? '—'} km</dd></div>
            <div><dt>Fuel</dt><dd>{v.fuelLitres ?? '—'} L</dd></div>
            <div><dt>Stops</dt><dd>{stops.length}</dd></div>
          </dl>

          <ol className="route-sequence" aria-label="Stop sequence">
            <li className="route-node depot">
              <span className="route-marker" aria-hidden="true">D</span>
              <div><strong>{activeDepot} depot</strong><span className="route-meta">Departs to {v.district ?? 'the district'}</span></div>
            </li>
            {stops.map(stop => (
              <li key={stop.orderId ?? stop.ref} className="route-node">
                <span className="route-marker" aria-hidden="true">{stop.seq}</span>
                <div>
                  <strong>{stop.ref}</strong> <span className="route-meta">{stop.outletName}</span>
                  <div className="route-times">
                    <span>Window {stop.window}</span>
                    {stop.plannedArrival && <span>Arrives {stop.plannedArrival}</span>}
                    {stop.serviceStart && stop.plannedArrival && stop.serviceStart !== stop.plannedArrival && (
                      <span>Waits until {stop.serviceStart}</span>
                    )}
                  </div>
                  <div className="route-tags">
                    {stop.dockType && <span className="route-tag">{stop.dockType.replaceAll('_', ' ')}</span>}
                    {stop.parkingConstraint === 'van_only' && <span className="route-tag warn">Van only</span>}
                    {stop.isChilled && <span className="route-tag cold">Chilled</span>}
                    <span className="route-tag">{stop.volume}</span>
                  </div>
                </div>
              </li>
            ))}
            <li className="route-node depot">
              <span className="route-marker" aria-hidden="true">D</span>
              <div><strong>Back to {activeDepot}</strong><span className="route-meta">Return leg counts in distance and fuel, not in trip time</span></div>
            </li>
          </ol>
        </>
      )}

      <p className="route-panel-note">
        Schematic order of stops. The competition data has no outlet or depot coordinates, so no map or road route is drawn.
        Times come from the server's district travel model.
      </p>
    </section>
  )
}
