import { Button, EmptyState } from '../../components'
import type { VehicleRouteStop } from './PlanningStep3Allocation'

export interface InteractiveRouteMapProps {
  activeDepot: string
  vehicleId: string
  vehicleType?: string
  accentColor?: string
  stops?: VehicleRouteStop[]
  viewMode?: 'this' | 'all'
  allRoutes?: {
    vehicleId: string
    color: string
    stops: VehicleRouteStop[]
  }[]
  onViewStops?: () => void
}

export function InteractiveRouteMap({ activeDepot, vehicleId, onViewStops }: InteractiveRouteMapProps) {
  return (
    <div className="route-map-container">
      <EmptyState title="Outlet coordinates unavailable"
        description={`The reference inputs for ${activeDepot} do not provide outlet coordinates. Review ${vehicleId}'s saved stop sequence instead.`} />
      {onViewStops && <Button variant="secondary" onClick={onViewStops}>View stops</Button>}
    </div>
  )
}
