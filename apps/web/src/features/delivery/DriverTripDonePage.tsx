import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, House } from 'lucide-react'
import { ActionError, Failure, Loading } from './DriverParts'
import { num, plural, useDriverAction, useDriverTrip } from './driverQueries'
import './driver.css'

/** Figma Driver · Trip Completed (60:5432) and Trip Submitted (60:5468). */
export function DriverTripDonePage() {
  const tripIndex = Number(useParams().tripIndex)
  const trip = useDriverTrip(tripIndex)
  const action = useDriverAction(tripIndex, trip.data?.version)
  const [submitted, setSubmitted] = useState(false)
  if (trip.isPending) return <Loading label="Loading the trip" />
  if (trip.isError) return <Failure error={trip.error} back="/driver" message="The trip could not be loaded." onRetry={() => void trip.refetch()} />
  const detail = trip.data
  const card = detail.card
  if (card.state === 'COMPLETED' || submitted) {
    return (
      <div className="dv-page">
        <div className="dv-done">
          <span className="dv-done-icon dv-done-good"><CheckCircle2 size={40} aria-hidden="true" /></span>
          <h1 className="dv-done-title">Trip submitted</h1>
          <p className="dv-done-sub">Trip record saved. The dispatcher can see it now.</p>
        </div>
        <div className="dv-body"><Link to="/driver" className="dv-btn dv-btn-primary"><House size={20} aria-hidden="true" />Back to Home</Link></div>
      </div>
    )
  }
  const remaining = detail.stops.filter(s => s.status !== 'COMPLETED').length
  if (card.state !== 'IN_PROGRESS' || remaining > 0) return <Navigate to={`/driver/trips/${tripIndex}`} replace />
  const delivered = detail.stops.flatMap(s => s.orders).filter(o => o.outcome?.outcome === 'DELIVERED').length
  return (
    <div className="dv-page">
      <div className="dv-done">
        <span className="dv-done-icon dv-done-brand"><CheckCircle2 size={40} aria-hidden="true" /></span>
        <h1 className="dv-done-title">Trip completed</h1>
        <p className="dv-done-sub">Trip {card.tripIndex} · <span className="dv-mono">{card.vehicleId}</span></p>
      </div>
      <div className="dv-body dv-body-tight">
        <section className="dv-card dv-card-raised" aria-label="Trip summary">
          <div className="dv-tiles">
            <div className="dv-tile"><span className="dv-tile-label">Stops</span><span className="dv-tile-value">{card.stopsDone} / {card.stops}</span></div>
            <div className="dv-tile"><span className="dv-tile-label">Orders</span><span className="dv-tile-value">{card.ordersDone} / {card.orders}</span></div>
            <div className="dv-tile"><span className="dv-tile-label">Delivered</span><span className="dv-tile-value">{plural(delivered, 'delivery', 'deliveries')}</span></div>
            <div className="dv-tile"><span className="dv-tile-label">Distance</span><span className="dv-tile-value">{num(card.distanceKm, 1)} km (planned)</span></div>
          </div>
          {card.issues > 0 ? <div className="dv-info dv-info-warn"><AlertTriangle size={16} aria-hidden="true" />{plural(card.issues, 'issue')} reported</div> : null}
        </section>
        <button type="button" className="dv-btn dv-btn-primary" disabled={action.isPending}
          onClick={() => action.mutate({ kind: 'complete' }, { onSuccess: () => setSubmitted(true) })}>{action.isPending ? 'Saving…' : 'Finish Trip'}</button>
        <ActionError error={action.error} />
      </div>
    </div>
  )
}
