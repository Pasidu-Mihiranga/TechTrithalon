import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, MapPin, Navigation, Route } from 'lucide-react'
import { ActionError, DriverHeader, Failure, Loading, NetPill, OfflineNotice, routeLabel, tripState } from './DriverParts'
import { clock, num, plural, useDriverAction, useDriverHome, useDriverTrip } from './driverQueries'
import type { DriverStop, DriverTripDetail } from './driverQueries'
import './driver.css'

/** The Trip tab opens the trip to work on now (the first one not completed). */
export function DriverCurrentTripPage() {
  const home = useDriverHome()
  if (home.isPending) return <Loading label="Finding your trip" />
  if (home.isError) return <Failure error={home.error} message="Your trips could not be loaded." onRetry={() => void home.refetch()} />
  const target = home.data.current ?? home.data.trips[home.data.trips.length - 1]
  if (!target) return <Navigate to="/driver" replace />
  return <Navigate to={`/driver/trips/${target.tripIndex}`} replace />
}

export function stopBadge(stop: DriverStop, current: number | null) {
  const issue = stop.orders.some(o => o.outcome && o.outcome.outcome !== 'DELIVERED')
  if (stop.status === 'COMPLETED') return issue ? { label: 'Issue', tone: 'bad' } : { label: 'Done', tone: 'good' }
  if (stop.status === 'ARRIVED' || stop.seq === current) return { label: 'Current', tone: 'brand' }
  return { label: 'Upcoming', tone: 'muted' }
}

export function stopTime(stop: DriverStop) {
  if (stop.departedAt) return null
  if (stop.eta) return `ETA ${clock(stop.eta)}${stop.late ? ' · after window' : ''}`
  return `Planned ${clock(stop.plannedArrival)}`
}

/** Figma Driver · Trip Overview (56:5295): trip tabs, progress, the next stop and the stop sequence. */
export function DriverTripPage() {
  const tripIndex = Number(useParams().tripIndex)
  const trip = useDriverTrip(tripIndex)
  const home = useDriverHome()
  if (trip.isPending) return <Loading label="Loading the trip" />
  if (trip.isError) return <Failure error={trip.error} back="/driver" message="The trip could not be loaded." onRetry={() => void trip.refetch()} />
  const detail = trip.data
  const card = detail.card
  const state = tripState(card)
  const delivered = card.ordersDone
  const pct = card.orders > 0 ? Math.round((delivered / card.orders) * 100) : 0
  const trips = home.data?.trips ?? []

  return (
    <div className="dv-page">
      <DriverHeader back="/driver" title={`Trip ${card.tripIndex}`} sub={`${card.vehicleId} · ${card.brand}`}>
        <NetPill />
        <span className={`dv-pill dv-pill-${state.tone}`}>{state.label}</span>
      </DriverHeader>
      <div className="dv-body">
        <OfflineNotice />
        {trips.length > 1 ? (
          <nav className="dv-seg" aria-label="Your trips today">
            {trips.map(t => (
              <Link key={t.tripIndex} to={`/driver/trips/${t.tripIndex}`} aria-current={t.tripIndex === tripIndex ? 'page' : undefined}
                className={`dv-seg-item${t.tripIndex === tripIndex ? ' dv-seg-item-active' : ''}`}>
                Trip {t.tripIndex}<small>{t.brand} · {t.district}</small>
              </Link>
            ))}
          </nav>
        ) : null}
        <p className="dv-row dv-header-sub"><Navigation size={16} aria-hidden="true" />{routeLabel(card)} · {num(card.distanceKm, 1)} km</p>
        {detail.routeChanged ? (
          <div className="dv-info dv-info-warn" role="status">The dispatcher updated this trip to plan v{card.planVersion}. Stops you have finished stand; the stops still to serve follow the new plan.</div>
        ) : null}
        <div>
          <div className="dv-progress-head"><span>{delivered} / {card.orders} orders delivered</span></div>
          <div className="dv-track" role="progressbar" aria-valuemin={0} aria-valuemax={card.orders} aria-valuenow={delivered} aria-label="Orders recorded">
            <div className="dv-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <TripAction detail={detail} />
        <section className="dv-list" aria-label="Stop sequence">
          <p className="dv-overline">Stop sequence</p>
          {detail.stops.map(stop => {
            const badge = stopBadge(stop, detail.currentStopSeq)
            const time = stopTime(stop)
            return (
              <Link key={stop.seq} to={`/driver/trips/${tripIndex}/stops/${stop.seq}`}
                className={`dv-item${badge.label === 'Current' ? ' dv-item-current' : ''}${stop.status === 'COMPLETED' ? ' dv-item-done' : ''}`}>
                <span className="dv-seq">{stop.status === 'COMPLETED' ? <CheckCircle2 size={16} aria-hidden="true" /> : stop.seq}</span>
                <div className="dv-grow">
                  <p className="dv-item-title">{stop.outletId}</p>
                  <p className="dv-item-sub">{stop.district} · {plural(stop.orders.length, 'order')} · {num(stop.weightKg)} kg{time ? ` · ${time}` : ''}</p>
                </div>
                <span className={`dv-pill dv-pill-${badge.tone}`}>{badge.label}</span>
              </Link>
            )
          })}
        </section>
      </div>
    </div>
  )
}

function TripAction({ detail }: { detail: DriverTripDetail }) {
  const navigate = useNavigate()
  const card = detail.card
  const action = useDriverAction(card.tripIndex, detail.version)
  const base = `/driver/trips/${card.tripIndex}`
  if (card.state === 'READY' || card.state === 'LOADING') {
    return (
      <section className="dv-next" aria-label="Departure">
        <p className="dv-overline">Departure</p>
        <div className="dv-row">
          <span className="dv-pin"><Route size={18} aria-hidden="true" /></span>
          <div className="dv-grow">
            <p className="dv-next-title">Planned {clock(card.plannedDepart)} from {card.depot}</p>
            <p className="dv-next-sub">{plural(card.stops, 'stop')} · {plural(card.units, 'unit')} · {num(card.weightKg)} kg</p>
          </div>
        </div>
        {detail.startBlocker ? <p className="dv-next-sub" role="status">{detail.startBlocker}.</p> : null}
        <button type="button" className="dv-btn dv-btn-primary" disabled={Boolean(detail.startBlocker) || action.isPending}
          onClick={() => action.mutate({ kind: 'start', planVersion: card.planVersion })}>
          <Navigation size={20} aria-hidden="true" />{action.isPending ? 'Starting…' : 'Start Trip'}
        </button>
        <ActionError error={action.error} />
      </section>
    )
  }
  if (card.state === 'COMPLETED') {
    return (
      <div className="dv-info dv-info-good" role="status"><CheckCircle2 size={18} aria-hidden="true" />
        Trip finished. {plural(card.ordersDone, 'order')} recorded{card.issues > 0 ? `, ${plural(card.issues, 'issue')} reported` : ''}.</div>
    )
  }
  const next = detail.stops.find(s => s.seq === detail.currentStopSeq)
  if (!next) {
    return (
      <section className="dv-next" aria-label="Trip finished">
        <p className="dv-overline">All stops done</p>
        <p className="dv-next-title">Every stop is recorded</p>
        <button type="button" className="dv-btn dv-btn-primary" onClick={() => navigate(`${base}/complete`)}>Review and finish trip</button>
      </section>
    )
  }
  return (
    <section className="dv-next" aria-label="Next stop">
      <p className="dv-overline">{next.status === 'ARRIVED' ? 'Current stop' : 'Next stop'}</p>
      <div className="dv-row">
        <span className="dv-pin"><MapPin size={18} aria-hidden="true" /></span>
        <div className="dv-grow">
          <p className="dv-next-title">{next.outletId}</p>
          <p className="dv-next-sub">{next.district} · {plural(next.orders.length, 'order')} · {num(next.weightKg)} kg{stopTime(next) ? ` · ${stopTime(next)}` : ''}</p>
        </div>
      </div>
      <button type="button" className="dv-btn dv-btn-primary"
        onClick={() => navigate(next.status === 'ARRIVED' ? `${base}/stops/${next.seq}` : `${base}/route`)}>
        <Navigation size={20} aria-hidden="true" />{next.status === 'ARRIVED' ? 'Continue at Stop' : 'Go to Stop'}
      </button>
    </section>
  )
}
