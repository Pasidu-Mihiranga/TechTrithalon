import { Link, useNavigate } from 'react-router-dom'
import { ClipboardList, Navigation, Package, Route, Snowflake, Truck } from 'lucide-react'
import { EmptyState } from '../../components'
import logo from '../../components/waypoint-logo.png'
import { useAuth } from '../auth/auth'
import { ActionError, Failure, Loading, NetPill, routeLabel, tripState } from './DriverParts'
import { dayOf, minutes, num, plural, useDriverAction, useDriverHome } from './driverQueries'
import type { DriverTripCard } from './driverQueries'
import './driver.css'

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

export function initials(name?: string | null) {
  return (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || undefined
}

/** Figma Driver · Home (55:5282): today's trip with its one primary action, progress, summary, other trips. */
export function DriverHomePage() {
  const auth = useAuth()
  const home = useDriverHome()
  const firstName = auth.user?.displayName?.split(/\s+/)[0]
  const avatar = initials(auth.user?.displayName)

  if (home.isPending) return <Loading label="Loading today's trips" />
  if (home.isError) return <Failure error={home.error} message="Today's trips could not be loaded." onRetry={() => void home.refetch()} />
  const data = home.data
  const current = data.current
  const others = data.trips.filter(t => t.tripIndex !== current?.tripIndex)
  const pct = data.progress.stops > 0 ? Math.round((data.progress.stopsDone / data.progress.stops) * 100) : 0

  return (
    <div className="dv-page">
      <div className="dv-topbar">
        <img src={logo} alt="Waypoint Operations" className="dv-logo" />
        <span className="dv-spacer" />
        <NetPill />
        {avatar ? <Link to="/driver/profile" className="dv-avatar" aria-label="Your profile">{avatar}</Link> : null}
      </div>
      <section className="dv-hero" aria-label="Today's trip">
        <div>
          <h1 className="dv-greeting">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
          <p className="dv-date">{dayOf(data.planDate)} {data.planDate.slice(0, 4)}</p>
        </div>
        {current ? (
          <>
            <div className="dv-row">
              <p className="dv-overline dv-grow">Today's trip</p>
              <span className={`dv-pill dv-pill-${tripState(current).tone}`}>{tripState(current).label}</span>
            </div>
            <CurrentTrip card={current} />
          </>
        ) : data.trips.length > 0 ? (
          <p className="dv-note-dark">Every trip for today is finished. Thank you.</p>
        ) : null}
      </section>

      <div className="dv-body">
        {data.trips.length === 0 ? (
          <EmptyState title="No trips assigned yet" description="No plan with your vehicle has been published for today. Trips appear here when the dispatcher sends the plan." />
        ) : (
          <>
            <div aria-label="Today's progress">
              <div className="dv-progress-head"><span>Today's Progress</span><span>{data.progress.stopsDone} / {plural(data.progress.stops, 'stop')}</span></div>
              <div className="dv-track" role="progressbar" aria-valuemin={0} aria-valuemax={data.progress.stops} aria-valuenow={data.progress.stopsDone} aria-label="Stops done">
                <div className="dv-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
            {current ? (
              <section className="dv-card" aria-label="Trip summary">
                <p className="dv-card-title">Trip summary</p>
                <div className="dv-tiles">
                  <div className="dv-tile"><span className="dv-tile-label"><Package size={14} aria-hidden="true" />Stops</span><span className="dv-tile-value">{current.stops}</span></div>
                  <div className="dv-tile"><span className="dv-tile-label"><ClipboardList size={14} aria-hidden="true" />Orders</span><span className="dv-tile-value">{current.orders}</span></div>
                  <div className="dv-tile dv-tile-wide"><span className="dv-tile-label"><Truck size={14} aria-hidden="true" />Vehicle</span><span className="dv-tile-value">{current.vehicleId}</span></div>
                  <div className="dv-tile dv-tile-wide"><span className="dv-tile-label"><Navigation size={14} aria-hidden="true" />Distance/Time</span>
                    <span className="dv-tile-value">{num(current.distanceKm, 1)} km · {minutes(current.tripMinutes)}</span></div>
                </div>
              </section>
            ) : null}
            {others.length > 0 ? (
              <section className="dv-list" aria-label="Other trips">
                <p className="dv-overline">Other trips</p>
                {others.map(trip => (
                  <Link key={trip.tripIndex} to={`/driver/trips/${trip.tripIndex}`} className="dv-item">
                    <div className="dv-grow">
                      <p className="dv-card-title">Trip {trip.tripIndex}</p>
                      <p className="dv-item-sub">{routeLabel(trip)} · {plural(trip.stops, 'stop')} · {plural(trip.orders, 'order')}</p>
                    </div>
                    <span className={`dv-pill dv-pill-${trip.state === 'COMPLETED' ? 'good' : 'muted'}`}>
                      {trip.state === 'COMPLETED' ? 'Completed' : trip.state === 'IN_PROGRESS' ? 'In progress' : 'Not started'}
                    </span>
                  </Link>
                ))}
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function CurrentTrip({ card }: { card: DriverTripCard }) {
  const navigate = useNavigate()
  const action = useDriverAction(card.tripIndex, null)
  const tripPath = `/driver/trips/${card.tripIndex}`
  return (
    <div className="dv-trip">
      <div className="dv-row">
        <h2 className="dv-trip-title">Trip {card.tripIndex}</h2>
        <span className="dv-chip-dark"><Truck size={14} aria-hidden="true" />{card.vehicleId}</span>
        <span className={card.chilled ? 'dv-chip-cold' : 'dv-chip-dark'}>{card.chilled ? <Snowflake size={12} aria-hidden="true" /> : null}{card.brand}</span>
      </div>
      <p className="dv-trip-route">{routeLabel(card)}</p>
      <div className="dv-stats">
        <span><Package size={16} aria-hidden="true" />{plural(card.stops, 'stop')}</span>
        <span><ClipboardList size={16} aria-hidden="true" />{plural(card.orders, 'order')}</span>
        <span><Package size={16} aria-hidden="true" />{num(card.weightKg)} kg</span>
      </div>
      {card.state === 'READY' ? (
        <>
          <button type="button" className="dv-btn dv-btn-primary" disabled={action.isPending}
            onClick={() => action.mutate({ kind: 'start', planVersion: card.planVersion }, { onSuccess: () => navigate(tripPath) })}>
            <Navigation size={20} aria-hidden="true" />{action.isPending ? 'Starting…' : 'Start Trip'}
          </button>
          <ActionError error={action.error} />
        </>
      ) : card.state === 'IN_PROGRESS' ? (
        <Link to={tripPath} className="dv-btn dv-btn-primary"><Route size={20} aria-hidden="true" />Continue Trip</Link>
      ) : (
        <>
          <Link to={tripPath} className="dv-btn dv-btn-outline">View stops</Link>
          <p className="dv-note-dark">The loader is still loading this vehicle. You can start once the trip is handed over.</p>
        </>
      )}
    </div>
  )
}
