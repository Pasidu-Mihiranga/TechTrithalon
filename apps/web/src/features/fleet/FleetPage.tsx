import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, Input, LoadingState, MetricCard, PageHeader, Select, TypeBadge, type Column } from '../../components'
import { useFleetOverview } from './fleetQueries'
import { useDispatcherScope } from '../shell/useDispatcherScope'

type FleetRow = NonNullable<ReturnType<typeof useFleetOverview>['data']>['vehicles'][number]
type FleetState = 'all' | 'on_route' | 'idle' | 'in_workshop' | 'not_recorded'
const STATE_LABELS: Record<Exclude<FleetState, 'all'>, string> = {
  on_route: 'On route', idle: 'Idle', in_workshop: 'In workshop', not_recorded: 'Not recorded',
}

export function FleetPage() {
  const scope = useDispatcherScope()
  const overview = useFleetOverview(undefined, scope.depot)
  const [search, setSearch] = useState('')
  const [state, setState] = useState<FleetState>('all')
  const [type, setType] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const types = useMemo(() => [...new Set((overview.data?.vehicles ?? []).map(row => row.vehicle.type).filter((value): value is string => Boolean(value)))].sort(), [overview.data])
  const shown = useMemo(() => (overview.data?.vehicles ?? []).filter(row =>
    (state === 'all' || row.state === state) && (!type || row.vehicle.type === type)
    && (!search.trim() || `${row.vehicle.vehicleId} ${row.driverName ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))),
  [overview.data, state, search, type])
  const selected = shown.find(row => row.vehicle.vehicleId === selectedId) ?? shown[0] ?? null
  const columns: Column<FleetRow>[] = [
    {
      key: 'vehicleId', header: 'Vehicle',
      cell: (row) => <button type="button" className="table-link" aria-pressed={selected?.vehicle.vehicleId === row.vehicle.vehicleId}
        onClick={() => setSelectedId(row.vehicle.vehicleId)}>{row.vehicle.vehicleId}</button>,
    },
    {
      key: 'type', header: 'Type',
      cell: (row) => (
        <TypeBadge kind={row.vehicle.temp === 'reefer' ? 'fridge' : row.vehicle.type === 'van' ? 'van' : 'normal'}>
          {row.vehicle.type} · {row.vehicle.temp}
        </TypeBadge>
      ),
    },
    { key: 'driver', header: 'Driver', cell: row => row.driverName || 'Not assigned' },
    {
      key: 'state', header: 'Status',
      cell: row => <Badge tone={row.state === 'on_route' ? 'success' : row.state === 'in_workshop' ? 'warning' : 'neutral'}>
        {STATE_LABELS[row.state as Exclude<FleetState, 'all'>] ?? row.state}</Badge>,
    },
    {
      key: 'today', header: 'Today', cell: row => row.stops > 0 ? `${row.stopsDone} / ${row.stops} stops` : 'No published trip',
    },
  ]

  return (
    <>
      <PageHeader title="Fleet" subtitle={overview.data
        ? `${overview.data.depot} · vehicles and drivers · ${overview.data.date}`
        : 'Vehicles and drivers for the selected delivery day.'}
        actions={<Button variant="secondary" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>Filters</Button>} />
      {overview.isPending && <LoadingState rows={4} label="Loading fleet" />}
      {overview.isError && <ErrorState error={overview.error} message="Fleet data could not be loaded." onRetry={() => void overview.refetch()} />}
      {overview.data && <section className="grid-metrics" aria-label="Fleet status">
        <MetricCard label="Total vehicles" value={overview.data.totalVehicles} caption={overview.data.depot} />
        <MetricCard label="On route" value={overview.data.onRouteVehicles} caption="Vehicles currently travelling" />
        <MetricCard label="Idle" value={overview.data.idleVehicles} caption="Available and not on route" />
        <MetricCard label="In maintenance" value={overview.data.inWorkshopVehicles} caption="Recorded in workshop" />
      </section>}
      {overview.data && overview.data.unrecordedVehicles > 0 && <p className="field-hint">Availability has not been recorded for {overview.data.unrecordedVehicles} vehicles.</p>}
      {overview.data && overview.data.vehicles.length === 0 && (
        <EmptyState title="No vehicles" description="No vehicles are in scope for your depot." />
      )}
      {overview.data && overview.data.vehicles.length > 0 && <div className="dashboard-split">
        <Card className="fleet-list">
          <div role="group" aria-label="Filter fleet status" className="segmented-control fleet-tabs">
            {([['all', `All vehicles (${overview.data.totalVehicles})`], ['on_route', `On route (${overview.data.onRouteVehicles})`],
              ['idle', `Idle (${overview.data.idleVehicles})`], ['in_workshop', `Maintenance (${overview.data.inWorkshopVehicles})`],
              ['not_recorded', `Not recorded (${overview.data.unrecordedVehicles})`]] as const).map(([key, label]) =>
                <button key={key} type="button" className={`segmented-btn${state === key ? ' active' : ''}`}
                  aria-pressed={state === key} onClick={() => { setState(key); setSelectedId(null) }}>{label}</button>)}
          </div>
          <div className="toolbar-row fleet-toolbar">
            <Input label="Search vehicle or driver" type="search" value={search} onChange={event => { setSearch(event.target.value); setSelectedId(null) }} />
            {filtersOpen && <Select label="Vehicle type" value={type} onChange={event => { setType(event.target.value); setSelectedId(null) }}
              options={[{ value: '', label: 'All types' }, ...types.map(name => ({ value: name, label: name }))]} />}
          </div>
          {shown.length === 0
            ? <EmptyState title="No matching vehicles" description="Change the search or filters to see other vehicles." />
            : <DataTable caption="Fleet" columns={columns} rows={shown} rowKey={row => row.vehicle.vehicleId} />}
        </Card>
        {selected ? <Card>
          <div className="card-header-row"><h2 className="text-heading-s">{selected.vehicle.vehicleId}</h2>
            <Badge tone={selected.state === 'on_route' ? 'success' : selected.state === 'in_workshop' ? 'warning' : 'neutral'}>
              {STATE_LABELS[selected.state as Exclude<FleetState, 'all'>] ?? selected.state}</Badge></div>
          <p className="field-hint">{selected.vehicle.type} · {selected.vehicle.temp} · {selected.vehicle.depot}</p>
          <dl className="detail-grid">
            <div><dt>Driver</dt><dd>{selected.driverName || 'Not assigned'}</dd></div>
            <div><dt>Capacity</dt><dd>{selected.vehicle.volumeCapM3 ?? '—'} m³ · {selected.vehicle.weightCapKg ?? '—'} kg</dd></div>
            <div><dt>Today&apos;s trip</dt><dd>{selected.tripIndex == null ? 'No published trip' : `Trip ${selected.tripIndex}`}</dd></div>
            <div><dt>Stops</dt><dd>{selected.tripIndex == null ? '—' : `${selected.stopsDone} of ${selected.stops} done`}</dd></div>
            <div><dt>Availability</dt><dd>{selected.vehicle.availabilityRecorded
              ? selected.vehicle.availabilityStatus === 'in_workshop' ? 'In workshop' : 'Available' : 'Not recorded'}</dd></div>
          </dl>
          <Link className="btn btn-secondary btn-md" to={`/dispatcher/fleet/${selected.vehicle.vehicleId}`}>Open vehicle details</Link>
        </Card> : <Card><h2 className="text-heading-s">Vehicle detail</h2><p className="field-hint">Select a vehicle to see its capacity, trip and availability.</p></Card>}
      </div>}
    </>
  )
}
