import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, ErrorState, LoadingState, PageHeader, Select, TypeBadge } from '../../components'
import { api, apiReadError } from '../../lib/apiClient'
import { useFleetVehicle } from './fleetQueries'

export function FleetDetailPage() {
  const vehicleId = useParams().vehicleId ?? ''
  const [params] = useSearchParams()
  const date = params.get('date') || undefined
  const vehicle = useFleetVehicle(vehicleId, date)
  const cache = useQueryClient()
  const [status, setStatus] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<Error | null>(null)
  const [saved, setSaved] = useState(false)
  async function saveAvailability() {
    if (!vehicle.data?.date || !note?.trim()) return
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const { data, response } = await api.PATCH('/api/v1/dispatcher/vehicles/{id}/availability', {
        params: { path: { id: vehicleId } },
        body: { date: vehicle.data.date, status: status || vehicle.data.availabilityStatus || 'available',
          note: note.trim(), expectedVersion: vehicle.data.availabilityVersion ?? 0 },
      })
      if (!data) throw apiReadError(response, 'Availability could not be saved')
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['dispatcher', 'fleet'] }),
        cache.invalidateQueries({ queryKey: ['dispatcher', 'fleet-overview'] }),
        vehicle.refetch(),
      ])
      setNote(null)
      setStatus('')
      setSaved(true)
    } catch (error) {
      setSaveError(error instanceof Error ? error : new Error('Availability could not be saved'))
    } finally { setSaving(false) }
  }

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
        <><Card>
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
        <Card>
          <h2 className="text-heading-s">Record availability</h2>
          <p className="field-hint">This updates the vehicle for {vehicle.data.date} and is used by planning snapshots.</p>
          <div className="toolbar-row">
            <Select label="Status" value={status || vehicle.data.availabilityStatus || 'available'}
              onChange={event => { setStatus(event.target.value); setSaved(false) }} options={[
                { value: 'available', label: 'Available' }, { value: 'in_workshop', label: 'In workshop' },
              ]} />
            <div className="field">
              <label className="field-label" htmlFor="availability-note">Reason for change</label>
              <textarea id="availability-note" className="input" maxLength={500} value={note ?? ''}
                onChange={event => { setNote(event.target.value); setSaved(false) }} />
            </div>
          </div>
          {saveError && <ErrorState error={saveError} message="Availability could not be saved. Reload this vehicle if its status changed elsewhere." onRetry={() => void vehicle.refetch()} />}
          {saved && <p role="status">Availability saved.</p>}
          <Button disabled={saving || !note?.trim()} loading={saving} onClick={() => void saveAvailability()}>Save availability</Button>
        </Card></>
      )}
    </>
  )
}
