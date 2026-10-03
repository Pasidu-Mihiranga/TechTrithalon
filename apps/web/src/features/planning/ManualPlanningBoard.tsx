import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, MetricCard, PageHeader, Select, UtilisationBar, ViolationCard } from '../../components'
import { api } from '../../lib/apiClient'
import { useReferenceSummary } from '../shell/useReferenceSummary'
import { useDispatcherScope } from '../shell/useDispatcherScope'
import { ManualPlanRequestError, useCreateManualPlan, useEditManualPlan, useManualPlan, useManualPlans } from './manualPlanQueries'
import type { ManualPlanView } from './manualPlanQueries'
import { DEFER_REASONS, deferReasonLabel, type DeferReasonCode } from './deferralReasons'

type Edit = Parameters<ReturnType<typeof useEditManualPlan>['mutateAsync']>[0]
const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim()
const options = (values: string[]) => [...new Set(values)].map(value => ({ value, label: value }))

/** Functional manual path; the existing design system supplies controls pending design review. */
export function ManualPlanningBoard() {
  const [params, setParams] = useSearchParams()
  const summary = useReferenceSummary()
  const scope = useDispatcherScope()
  const [date, setDate] = useState('')
  const [depot, setDepot] = useState('')
  const [reason, setReason] = useState('')
  const [failure, setFailure] = useState<Error | null>(null)
  const [freezing, setFreezing] = useState(false)
  const depots = useQuery({ queryKey: ['reference', 'depots'], retry: false, queryFn: async () => {
    const result = await api.GET('/api/v1/reference/depots')
    if (!result.data) throw new ManualPlanRequestError(result.response, result.error)
    return result.data
  } })
  const planDate = date || summary.data?.demoOperatingDate || ''
  const selectedDepot = scope.depot || depot || depots.data?.[0] || ''
  const plans = useManualPlans(planDate, selectedDepot || undefined)
  const selectedId = Number(params.get('planId')) || undefined
  const current = useManualPlan(selectedId)
  const create = useCreateManualPlan()
  const edit = useEditManualPlan(selectedId ?? 0)
  const busy = freezing || create.isPending || edit.isPending
  const view = current.data

  async function begin() {
    setFailure(null); setFreezing(true)
    try {
      const snapshot = await api.POST('/api/v1/dispatcher/planning/snapshots', { body: { planDate, depot: selectedDepot } })
      if (!snapshot.data) throw new ManualPlanRequestError(snapshot.response, snapshot.error)
      const saved = await create.mutateAsync({ snapshotId: snapshot.data.id, reason })
      setParams({ planId: String(saved.plan.id) })
    } catch (error) { setFailure(error instanceof Error ? error : new Error('The candidate could not be created.')) }
    finally { setFreezing(false) }
  }
  async function apply(command: Edit) {
    if (view?.plan.lockVersion === undefined) { setFailure(new Error('Reload the plan before editing.')); return }
    setFailure(null)
    try { await edit.mutateAsync(command) }
    catch (error) { setFailure(error instanceof Error ? error : new Error('The edit could not be saved.')) }
  }
  // Controls and apply() both refuse edits until the server revision is present.
  const command = { expectedVersion: view?.plan.lockVersion as number, reason }
  const blocked = busy || !reason.trim() || view?.plan.status !== 'candidate' || view.plan.lockVersion === undefined
  const violations = failure instanceof ManualPlanRequestError ? failure.violations : view?.validation?.violations

  if (summary.isPending || depots.isPending) return <LoadingState label="Loading manual planning scope" />
  if (summary.isError || depots.isError) return <ErrorState error={summary.error ?? depots.error} message="Planning scope could not be loaded." />
  if (!selectedDepot || !planDate) return <EmptyState title="Planning scope is missing" description="Configure an accessible depot and an operating date." />

  return <>
    <PageHeader title="Manual planning" subtitle="Every edit is validated and saved by the API. Publication rechecks the persisted plan."
      actions={<Link to="/dispatcher/planning">Back to planning</Link>} />
    <Card>
      <Input label="Plan date" type="date" value={planDate} disabled={busy} onChange={event => { setDate(event.target.value); setParams({}); setFailure(null) }} />
      <Select label="Planning depot" value={selectedDepot} disabled={busy || Boolean(scope.depot)} options={options(depots.data ?? [])}
        onChange={event => { setDepot(event.target.value); setParams({}); setFailure(null) }} />
      <Input label="Change reason" required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} hint="Required for creation, every edit, deferral and publication." />
      <Button loading={freezing || create.isPending} disabled={busy || !reason.trim()} onClick={() => void begin()}>Freeze orders and create candidate</Button>
      {plans.isPending ? <LoadingState label="Loading candidates" /> : plans.isError ? <ErrorState error={plans.error} message={plans.error.message} onRetry={() => void plans.refetch()} /> :
        <Select label="Saved plan" value={String(selectedId ?? '')} placeholder="Choose a plan" options={(plans.data ?? []).map(item => ({
          value: String(item.plan.id), label: `Plan ${item.plan.id} · version ${item.plan.version} · ${item.plan.status}`,
        }))} onChange={event => { setParams(event.target.value ? { planId: event.target.value } : {}); setFailure(null) }} />}
    </Card>
    {failure ? <ErrorState error={failure} message={failure.message} traceId={failure instanceof ManualPlanRequestError ? failure.traceId : undefined}
      onRetry={() => { setFailure(null); if (selectedId) void current.refetch() }} /> : null}
    {selectedId && current.isPending ? <LoadingState label="Loading plan" /> : null}
    {current.isError ? <ErrorState error={current.error} message={current.error.message} onRetry={() => void current.refetch()} /> : null}
    {(violations ?? []).map((violation, index) => <ViolationCard key={`${violation.ruleCode}-${index}`} violation={{
      ...violation, ruleCode: violation.ruleCode ?? 'UNKNOWN_RULE', message: violation.message ?? 'Review the server rule evidence.',
      severity: violation.severity === 'INFO' ? 'INFO' : 'HARD',
    }} />)}
    {view ? <>
      <PageHeader title={`Plan ${view.plan.id} · ${view.plan.status}`} subtitle={`${view.plan.planDate} · ${view.plan.depot} · revision ${view.plan.lockVersion}`}
        actions={<Button variant="secondary" disabled={busy} onClick={() => void current.refetch()}>Reload plan</Button>} />
      <section className="grid-metrics" aria-label="Server plan metrics">
        <MetricCard label="Assigned orders" value={view.validation?.metrics?.ordersAssigned ?? 'Unavailable'} />
        <MetricCard label="Unassigned orders" value={view.validation?.metrics?.ordersUnassigned ?? 'Unavailable'} />
        <MetricCard label="Distance (km)" value={view.validation?.metrics?.totalDistanceKm ?? 'Unavailable'} />
        <MetricCard label="Fuel (L)" value={view.validation?.metrics?.totalFuelLitres ?? 'Unavailable'} />
      </section>
      {view.plan.status === 'published' ? <EmptyState title="Plan published" description="Assignments and fuel reservation are committed. This plan is locked." /> : null}
      <TripCreator view={view} blocked={blocked} onAdd={trip => void apply({ operation: 'addTrip', body: { ...command, trip } })} />
      {(view.trips ?? []).map(trip => <Card key={trip.id} aria-label={`Trip ${trip.id}`}>
        <h2>Trip {trip.id} · {trip.vehicleId} · slot {trip.tripIndex} · {trip.brand} · {trip.district}</h2>
        <p>Duration: {trip.tripMinutes ?? 'Unavailable'} min · Distance: {trip.distanceKm ?? 'Unavailable'} km · Fuel: {trip.fuelLitres ?? 'Unavailable'} L</p>
        <p>Volume: {view.utilisation?.[String(trip.id)]?.volumeUsedM3 ?? 'Unavailable'} / {view.utilisation?.[String(trip.id)]?.volumeLimitM3 ?? 'Unavailable'} m³ · Weight: {view.utilisation?.[String(trip.id)]?.weightUsedKg ?? 'Unavailable'} / {view.utilisation?.[String(trip.id)]?.weightLimitKg ?? 'Unavailable'} kg</p>
        {view.utilisation?.[String(trip.id)] ? <TripUtilisation load={view.utilisation[String(trip.id)]} /> : null}
        <ol>{(trip.stops ?? []).map((stop, index, stops) => <li key={stop.orderId}>
          {stop.order?.orderRef} · {stop.order?.outletId} · arrival {stop.plannedArrival} · service {stop.serviceStart}
          <Button variant="ghost" disabled={blocked || index === 0} aria-label={`Move ${stop.order?.orderRef} earlier`} onClick={() => {
            const ids = stops.map(item => item.orderId!)
            ;[ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]
            void apply({ operation: 'sequence', tripId: trip.id!, body: { ...command, orderIds: ids } })
          }}>Earlier</Button>
          <Button variant="ghost" disabled={blocked} onClick={() => void apply({ operation: 'move', body: { ...command, orderId: stop.orderId!, fromTripId: trip.id } })}>Remove {stop.order?.orderRef}</Button>
        </li>)}</ol>
        <form onSubmit={event => {
          event.preventDefault(); const data = new FormData(event.currentTarget)
          void apply({ operation: 'vehicle', tripId: trip.id!, body: { ...command, vehicleId: text(data, 'vehicle'), tripIndex: Number(text(data, 'slot')) } })
        }}>
          <Select label={`Vehicle for trip ${trip.id}`} name="vehicle" defaultValue={trip.vehicleId} options={(view.fleet ?? []).map(vehicle => ({ value: vehicle.vehicleId!, label: `${vehicle.vehicleId} · ${vehicle.availabilityStatus ?? 'Unrecorded'}` }))} required />
          <Input label={`Slot for trip ${trip.id}`} name="slot" type="number" min={1} max={2} defaultValue={trip.tripIndex} required />
          <Button type="submit" disabled={blocked}>Change vehicle or slot</Button>
        </form>
        <Button variant="danger" disabled={blocked} onClick={() => void apply({ operation: 'removeTrip', tripId: trip.id!, body: command })}>Remove trip {trip.id}</Button>
      </Card>)}
      {!(view.trips?.length) ? <EmptyState title="No trips" description="Add a vehicle trip, then assign whole orders." /> : null}
      <Card><h2>Assign or move an order</h2>
        <form onSubmit={event => {
          event.preventDefault(); const data = new FormData(event.currentTarget); const orderId = Number(text(data, 'order'))
          const source = view.trips?.find(trip => trip.stops?.some(stop => stop.orderId === orderId))
          void apply({ operation: 'move', body: { ...command, orderId, fromTripId: source?.id, toTripId: Number(text(data, 'target')) } })
        }}>
          <Select label="Order to assign or move" name="order" required placeholder="Choose an order" options={[
            ...(view.unassignedOrders ?? []).map(item => ({ value: String(item.order?.id), label: `${item.order?.orderRef} · ${item.disposition}` })),
            ...(view.trips ?? []).flatMap(trip => (trip.stops ?? []).map(stop => ({ value: String(stop.orderId), label: `${stop.order?.orderRef} · trip ${trip.id}` }))),
          ]} />
          <Select label="Target trip" name="target" required placeholder="Choose a trip" options={(view.trips ?? []).map(trip => ({ value: String(trip.id), label: `Trip ${trip.id} · ${trip.brand} · ${trip.vehicleId}` }))} />
          <Button type="submit" disabled={blocked || !view.trips?.length}>Save assignment</Button>
        </form>
      </Card>
      <Card><h2>Unassigned and deferred orders</h2>
        {(view.unassignedOrders ?? []).map(item => <div key={item.order?.id}>
          <h3>{item.order?.orderRef} · {item.disposition}</h3><p>{item.reason || 'Assign or defer this order before publication.'}{item.reasonCode ? ` · ${deferReasonLabel(item.reasonCode)}` : ''}{item.nextDeliveryDate ? ` · next delivery ${item.nextDeliveryDate}` : ''}{item.decidedByName ? ` · recorded by ${item.decidedByName}` : ''}</p>
          <FairnessNote fairness={view.fairness?.[String(item.order?.id)]} />
          <form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget)
            void apply({ operation: 'defer', orderId: item.order!.id!, body: { ...command, nextDeliveryDate: text(data, 'nextDate') || undefined,
              reasonCode: text(data, 'reasonCode') as DeferReasonCode, protectNextRun: data.get('protect') === 'on', notifyStore: data.get('notify') === 'on' } })
          }}>
            <Select label={`Deferral reason for ${item.order?.orderRef}`} name="reasonCode" required placeholder="Choose a reason"
              defaultValue={item.reasonCode ?? ''} options={DEFER_REASONS.map(reason => ({ value: reason.code, label: reason.label }))} />
            <Input label={`Next delivery for ${item.order?.orderRef}`} name="nextDate" type="date" defaultValue={item.nextDeliveryDate} />
            <label className="check-field"><input type="checkbox" name="protect" defaultChecked={item.protectNextRun ?? true} /> Protect on the next run</label>
            <label className="check-field"><input type="checkbox" name="notify" defaultChecked={item.notifyStore ?? true} /> Notify the store manager</label>
            <Button type="submit" disabled={blocked}>Defer {item.order?.orderRef}</Button>
          </form>
          {item.disposition === 'DEFERRED' ? <Button variant="secondary" disabled={blocked} onClick={() => void apply({ operation: 'restore', orderId: item.order!.id!, body: command })}>Restore {item.order?.orderRef}</Button> : null}
        </div>)}
        {!view.unassignedOrders?.length ? <p>All snapshot orders are assigned.</p> : null}
      </Card>
      <Card><h2>Vehicle budgets</h2>
        {Object.entries(view.vehicleUtilisation ?? {}).map(([vehicle, usage]) => <p key={vehicle}>{vehicle} · Fresh {usage.freshMinutesUsed}/{usage.freshMinutesLimit} min · Other {usage.otherMinutesUsed}/{usage.otherMinutesLimit} min · Fuel committed before: {usage.fuelCommittedBeforeL} L · This plan: {usage.fuelForPlanL} L · Weekly quota: {usage.weeklyFuelLimitL} L</p>)}
      </Card>
      <Button disabled={blocked} loading={edit.isPending} onClick={() => void apply({ operation: 'publish', body: command })}>Publish manual plan</Button>
    </> : !selectedId ? <EmptyState title="Choose or create a candidate" description="Freeze all confirmed orders after cutoff to start manual planning." /> : null}
  </>
}

function FairnessNote({ fairness }: { fairness?: NonNullable<ManualPlanView['fairness']>[string] }) {
  if (!fairness) return null
  const notes = [
    fairness.protectedThisRun ? `Protected: carried from ${fairness.carriedFromDate}` : null,
    fairness.deferredPreviousOperatingDay ? `Skipped ${fairness.priorConsecutiveDeferrals} operating day(s) in a row${fairness.evidenceSource?.includes('source') ? ' (includes imported data)' : ''}` : null,
    fairness.daysSinceLastServed != null ? `${fairness.daysSinceLastServed} days since last served (imported data)` : null,
  ].filter(Boolean)
  return notes.length ? <p className="field-hint">{notes.join(' · ')}</p> : null
}

function TripUtilisation({ load }: { load: NonNullable<ManualPlanView['utilisation']>[string] }) {
  return <>
    {load.volumeUsedM3 !== undefined && load.volumeLimitM3 !== undefined ? <UtilisationBar label="Volume" actual={load.volumeUsedM3} limit={load.volumeLimitM3} unit="m³" /> : null}
    {load.weightUsedKg !== undefined && load.weightLimitKg !== undefined ? <UtilisationBar label="Weight" actual={load.weightUsedKg} limit={load.weightLimitKg} unit="kg" /> : null}
  </>
}

function TripCreator({ view, blocked, onAdd }: { view: ManualPlanView; blocked: boolean; onAdd: (trip: Extract<Edit, { operation: 'addTrip' }>['body']['trip']) => void }) {
  const orders = [...(view.unassignedOrders ?? []).flatMap(item => item.order ? [item.order] : []), ...(view.trips ?? []).flatMap(trip => (trip.stops ?? []).flatMap(stop => stop.order ? [stop.order] : []))]
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget)
    onAdd({ vehicleId: text(data, 'vehicle'), tripIndex: Number(text(data, 'slot')), brand: text(data, 'brand'), district: text(data, 'district'), orderIds: [] })
  }
  return <Card><h2>Add trip</h2><form onSubmit={submit}>
    <Select label="Trip vehicle" name="vehicle" placeholder="Choose a vehicle" required options={(view.fleet ?? []).map(vehicle => ({ value: vehicle.vehicleId!, label: `${vehicle.vehicleId} · ${vehicle.temp} · ${vehicle.availabilityStatus ?? 'Unrecorded'}` }))} />
    <Input label="Trip slot" name="slot" type="number" min={1} max={2} required />
    <Select label="Trip brand" name="brand" placeholder="Choose a brand" required options={options(orders.flatMap(order => order.brand ? [order.brand] : []))} />
    <Select label="Trip district" name="district" placeholder="Choose a district" required options={options(orders.flatMap(order => order.district ? [order.district] : []))} />
    <Button type="submit" disabled={blocked}>Add trip</Button>
  </form></Card>
}
