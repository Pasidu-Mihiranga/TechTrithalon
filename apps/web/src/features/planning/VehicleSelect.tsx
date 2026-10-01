import { RemoteSelect } from '../../components/RemoteSelect'
import { useVehicles } from '../../lib/referenceQueries'

interface VehicleSelectProps { value: string; onChange: (value: string) => void; disabled?: boolean }

/** Selects reference vehicles; operational availability must be checked for the planning date. */
export function VehicleSelect(props: VehicleSelectProps) {
  const query = useVehicles()
  return <RemoteSelect {...props} label="Vehicle" options={(query.data ?? []).map((vehicle) => ({
    value: vehicle.vehicleId, label: `${vehicle.vehicleId} · ${vehicle.type} · ${vehicle.temp} · ${vehicle.depot}`,
  }))} loading={query.isPending} error={query.error} retry={() => { void query.refetch() }} emptyMessage="No vehicles are available for your depot." />
}
