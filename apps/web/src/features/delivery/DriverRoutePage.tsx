import { Link, useParams } from 'react-router-dom'
import { MapPin, Navigation } from 'lucide-react'
import { DriverHeader, Failure, Loading, NetPill } from './DriverParts'
import { clock, plural, useDriverTrip } from './driverQueries'
import './driver.css'

/**
 * Figma Driver · Route (56:5398). The data has no outlet coordinates or street addresses, so instead of
 * a turn-by-turn map this shows the stop order schematically and hands navigation to the phone's maps
 * app for the stop's district. Flagged as a departure in docs/DELIVERY_VERIFICATION.md.
 */
export function DriverRoutePage() {
  const tripIndex = Number(useParams().tripIndex)
  const trip = useDriverTrip(tripIndex)
  if (trip.isPending) return <Loading label="Loading the route" />
  if (trip.isError) return <Failure error={trip.error} back="/driver" message="The route could not be loaded." onRetry={() => void trip.refetch()} />
  const detail = trip.data
  const next = detail.stops.find(s => s.seq === detail.currentStopSeq)
  const base = `/driver/trips/${tripIndex}`
  return (
    <div className="dv-page">
      <DriverHeader back={base} title={next ? `To ${next.outletId}` : `Trip ${tripIndex}`} sub={next ? `${next.district} district` : 'No stop to drive to'}>
        <NetPill />
      </DriverHeader>
      <div className="dv-body">
        <section className="dv-route-schematic" aria-label="Route order">
          <div className="dv-route-step"><span className="dv-route-dot dv-route-dot-done" />{detail.card.depot} depot · left {clock(detail.card.plannedDepart)}</div>
          {detail.stops.map(stop => (
            <div key={stop.seq} className="dv-route-step">
              <span className={`dv-route-dot${stop.status === 'COMPLETED' ? ' dv-route-dot-done' : stop.seq === detail.currentStopSeq ? ' dv-route-dot-next' : ''}`} />
              <span className="dv-grow">Stop {stop.seq} · {stop.outletId}</span>
              <span>{stop.status === 'COMPLETED' ? 'Done' : stop.eta ? `ETA ${clock(stop.eta)}` : `Planned ${clock(stop.plannedArrival)}`}</span>
            </div>
          ))}
          <p className="dv-meta">Map view is not available: the outlet data has no coordinates.</p>
        </section>
      </div>
      {next ? (
        <section className="dv-sheet" aria-label="Next stop">
          <div className="dv-row dv-row-top">
            <span className="dv-icon-tile dv-icon-tile-brand"><MapPin size={20} aria-hidden="true" /></span>
            <div className="dv-grow">
              <p className="dv-overline">Next stop</p>
              <p className="dv-item-title">{next.outletId}</p>
              <p className="dv-item-sub">{next.district} · {plural(next.orders.length, 'order')}</p>
            </div>
            <div className="dv-right"><strong>{clock(next.eta ?? next.plannedArrival)}</strong><span className="dv-meta">{next.eta ? 'ETA' : 'Planned'}</span></div>
          </div>
          <a className="dv-btn dv-btn-primary" target="_blank" rel="noreferrer"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${next.district}, Sri Lanka`)}`}>
            <Navigation size={20} aria-hidden="true" />Open Navigation
          </a>
          <Link to={`${base}/stops/${next.seq}`} className="dv-btn dv-btn-outline">View Stop Details</Link>
        </section>
      ) : null}
    </div>
  )
}
