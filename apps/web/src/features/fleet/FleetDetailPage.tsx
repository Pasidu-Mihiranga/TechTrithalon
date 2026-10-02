import { Link, useParams } from 'react-router-dom'
import { Badge, Card, ErrorState, LoadingState, PageHeader, TypeBadge } from '../../components'
import { useFleetVehicle } from './fleetQueries'

export function FleetDetailPage() {
  const vehicleId = useParams().vehicleId ?? ''
  const vehicle = useFleetVehicle(vehicleId)

  return (
    <>
      <PageHeader
        title={vehicle.data?.vehicleId ?? 'Vehicle'}
        subtitle={vehicle.data ? `${vehicle.data.depot} · ${vehicle.data.type} · ${vehicle.data.temp}` : 'Fleet detail'}
        actions={<Link className="btn btn-secondary btn-md" to="/dispatcher/fleet">Back to fleet</Link>}
      />
      {vehicle.isPending && <LoadingState rows={3} label="Loading vehicle" />}
      {vehicle.isError && <ErrorState error={vehicle.error} message="Vehicle could not be loaded." onRetry={() => void vehicle.refetch()} />}
      {vehicle.data && (
        <Card>
          <dl className="detail-grid">
            <div>
              <dt>Type</dt>
              <dd>
                <TypeBadge kind={vehicle.data.temp === 'reefer' ? 'fridge' : vehicle.data.type === 'van' ? 'van' : 'normal'}>
                  {vehicle.data.type} · {vehicle.data.temp}
                </TypeBadge>
              </dd>
            </div>
            <div>
              <dt>Availability ({vehicle.data.date})</dt>
              <dd>
                {vehicle.data.availabilityRecorded
                  ? <Badge tone={vehicle.data.availabilityStatus === 'in_workshop' ? 'warning' : 'success'}>{vehicle.data.availabilityStatus}</Badge>
                  : <Badge tone="neutral">Not recorded</Badge>}
              </dd>
            </div>
            <div><dt>Note</dt><dd>{vehicle.data.availabilityNote ?? '—'}</dd></div>
            <div><dt>Volume capacity</dt><dd>{vehicle.data.volumeCapM3} m³</dd></div>
            <div><dt>Weight capacity</dt><dd>{vehicle.data.weightCapKg} kg</dd></div>
            <div><dt>Fuel</dt><dd>{vehicle.data.fuelType} · {vehicle.data.weeklyFuelQuotaL} L / week</dd></div>
          </dl>
        </Card>
      )}
    </>
  )
}
