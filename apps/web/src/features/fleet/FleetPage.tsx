import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Badge, DataTable, EmptyState, ErrorState, LoadingState, PageHeader, TypeBadge, type Column } from '../../components'
import { useFleet } from './fleetQueries'
import { useDispatcherScope } from '../shell/useDispatcherScope'

type FleetRow = NonNullable<ReturnType<typeof useFleet>['data']>[number]


export function FleetPage() {
  const scope = useDispatcherScope()
  const fleet = useFleet(undefined, scope.depot)
  const columns = useMemo<Column<FleetRow>[]>(() => [
    {
      key: 'vehicleId', header: 'Vehicle',
      cell: (row) => <Link className="table-link" to={`/dispatcher/fleet/${row.vehicleId}`}>{row.vehicleId}</Link>,
    },
    {
      key: 'type', header: 'Type',
      cell: (row) => (
        <TypeBadge kind={row.temp === 'reefer' ? 'fridge' : row.type === 'van' ? 'van' : 'normal'}>
          {row.type} · {row.temp}
        </TypeBadge>
      ),
    },
    { key: 'depot', header: 'Depot', cell: (row) => row.depot },
    {
      key: 'capacity', header: 'Capacity', align: 'end',
      cell: (row) => `${row.volumeCapM3} m³ · ${row.weightCapKg} kg`,
    },
    {
      key: 'availability', header: 'Availability',
      cell: (row) => row.availabilityRecorded
        ? <Badge tone={row.availabilityStatus === 'in_workshop' ? 'warning' : 'success'}>{row.availabilityStatus}</Badge>
        : <Badge tone="neutral">Not recorded</Badge>,
    },
  ], [])

  return (
    <>
      <PageHeader title="Fleet" subtitle="Vehicles and workshop status for the demo delivery day." />
      {fleet.isPending && <LoadingState rows={4} label="Loading fleet" />}
      {fleet.isError && <ErrorState error={fleet.error} message="Fleet data could not be loaded." onRetry={() => void fleet.refetch()} />}
      {fleet.data && fleet.data.length === 0 && (
        <EmptyState title="No vehicles" description="No vehicles are in scope for your depot." />
      )}
      {fleet.data && fleet.data.length > 0 && (
        <DataTable caption="Fleet" columns={columns} rows={fleet.data} rowKey={(row) => row.vehicleId} />
      )}
    </>
  )
}
