import { Link } from 'react-router-dom'
import { ArrowRight, TriangleAlert } from 'lucide-react'
import { EmptyState, ErrorState, LoadingState } from '../../components'
import { useAuth } from '../auth/auth'
import { SHORTFALL_LABELS, clock, num, tripBadge, useLoaderBoard } from './loaderQueries'
import type { LoaderTripCard } from './loaderQueries'
import './loading.css'

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

export function runDate(iso?: string) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`))
}

/** Figma Loader · Home (93:7502, phone 365:7647): assigned trips, today's counts, next departure, issues. */
export function LoaderHomePage() {
  const auth = useAuth()
  const board = useLoaderBoard()
  const firstName = auth.user?.displayName?.split(/\s+/)[0]

  if (board.isPending) return <LoadingState rows={4} label="Loading today's trips" />
  if (board.isError) return <ErrorState error={board.error} message="Today's trips could not be loaded." onRetry={() => void board.refetch()} />
  const data = board.data
  const depot = data.depot.endsWith('Depot') ? data.depot : `${data.depot} Depot`
  const next = data.nextDeparture

  return (
    <div className="ld-page">
      <div className="ld-head">
        <div className="ld-head-text">
          <h1 className="ld-title">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
          <p className="ld-sub">{depot} · {runDate(data.planDate)}{data.planVersion ? ` · Manifest v${data.planVersion}` : ''}</p>
        </div>
      </div>

      {data.trips.length === 0 ? (
        <EmptyState title="No trips to load yet" description={`No plan has been published for ${depot} on ${runDate(data.planDate)}. Trips appear here when the dispatcher sends the plan.`} />
      ) : (
        <div className="ld-grid">
          <section className="ld-col" aria-label="Assigned trips">
            <p className="ld-overline">Assigned trips</p>
            {data.trips.map(card => <TripCard key={card.loadTaskId} card={card} primary={next?.loadTaskId === card.loadTaskId} />)}
          </section>

          <aside className="ld-side">
            <div className="ld-card" aria-label="Today">
              <div className="ld-list-head"><p className="ld-overline">Today</p></div>
              <div className="ld-stat-row">Trips assigned <strong>{data.summary.tripsAssigned}</strong></div>
              <div className="ld-stat-row">Orders to load <strong>{data.summary.ordersToLoad}</strong></div>
              <div className="ld-stat-row">Orders loaded <strong className="ld-stat-good">{data.summary.ordersLoaded}</strong></div>
              <div className="ld-stat-row">Open issues <strong className={data.summary.openIssues > 0 ? 'ld-stat-bad' : undefined}>{data.summary.openIssues}</strong></div>
            </div>
            {next ? (
              <div className="ld-callout" aria-label="Next departure">
                <p className="ld-overline">Next departure</p>
                <p className="ld-callout-title">{next.vehicleId} · Trip {next.tripIndex}</p>
                <p className="ld-callout-strong">{clock(next.plannedDepart)} · {next.orders} orders · {next.stops} stops</p>
                <p className="ld-callout-text">
                  {next.awaitingAcknowledgement ? `Manifest v${next.planVersion} changed — acknowledge it before loading.` : `Manifest v${next.planVersion} is current.`}
                  {next.driverName ? ` Driver: ${next.driverName}.` : ' No driver linked to this vehicle.'}
                </p>
              </div>
            ) : (
              <div className="ld-callout"><p className="ld-overline">Next departure</p><p className="ld-callout-text">Every trip is loaded.</p></div>
            )}
            <div className="ld-card ld-plain-note">
              <p className="ld-overline">Loading rule</p>
              <p>Load in reverse delivery order, then verify counts before driver handover.</p>
            </div>
          </aside>
        </div>
      )}

      {data.openIssues.length > 0 && (
        <section className="ld-card ld-card-pad" aria-label="Needs attention">
          <span className="ld-accent ld-accent-danger" />
          <div className="ld-row">
            <p className="ld-overline ld-grow">Needs attention</p>
            <span className="ld-badge ld-badge-danger">{data.openIssues.length} open {data.openIssues.length === 1 ? 'issue' : 'issues'}</span>
          </div>
          {data.openIssues.slice(0, 3).map(issue => (
            <div key={issue.id} className="ld-row">
              <span className="ld-rank ld-badge-danger"><TriangleAlert size={20} aria-hidden="true" /></span>
              <div className="ld-grow">
                <p className="ld-stop-title">{issue.orderRef} · {SHORTFALL_LABELS[issue.kind] ?? issue.kind} — {issue.shortUnits} {issue.shortUnits === 1 ? 'unit' : 'units'} short</p>
                <p className="ld-stop-sub">
                  {issue.vehicleId} · {issue.outletId} · {issue.holdsVehicle ? 'Vehicle held. ' : ''}Sent to the dispatcher — awaiting a decision.
                  The store will see {issue.orderedUnits - issue.shortUnits} of {issue.orderedUnits} units on its receipt.
                </p>
              </div>
            </div>
          ))}
          <Link to="/loader/issues" className="ld-btn ld-btn-s">View reported issues <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>
      )}
    </div>
  )
}

function TripCard({ card, primary }: { card: LoaderTripCard; primary: boolean }) {
  const badge = tripBadge(card)
  const done = card.status === 'loaded'
  const pct = card.stops > 0 ? Math.round((card.stopsLoaded / card.stops) * 100) : 0
  const tone = done ? 'loaded' : card.held ? 'held' : card.status === 'pending' && !primary ? 'queued' : 'loading'
  const counted = card.orders > 0 && card.ordersChecked === card.orders
  const action = done ? 'View loaded trip' : card.awaitingAcknowledgement ? 'Review new manifest'
    : card.held ? 'View held trip' : counted ? 'Hand over trip' : card.status === 'loading' ? 'Continue loading' : primary ? 'Start loading' : 'View schedule'
  return (
    <article className="ld-card ld-card-pad" aria-label={`Trip ${card.tripIndex} · ${card.vehicleId}`}>
      <span className={`ld-accent ld-accent-${tone}`} />
      <div className="ld-row">
        <div className="ld-grow">
          <h2 className="ld-card-title">Trip {card.tripIndex} · {card.vehicleId}</h2>
          <p className="ld-card-sub">{card.brand} · {card.district} district</p>
        </div>
        <span className={`ld-badge ld-badge-${badge.tone}`}>{badge.label}</span>
      </div>
      <div className="ld-chips">
        <span className="ld-chip">{card.stops} {card.stops === 1 ? 'stop' : 'stops'}</span>
        <span className="ld-chip">{card.orders} {card.orders === 1 ? 'order' : 'orders'}</span>
        <span className="ld-chip">{num(card.volumeM3)} / {num(card.volumeCapM3)} m³</span>
        <span className="ld-chip">{num(card.weightKg, 0)} / {num(card.weightCapKg, 0)} kg</span>
        <span className="ld-chip">Departs {clock(card.plannedDepart)}</span>
      </div>
      <div className="ld-progress">
        <div className="ld-track" role="progressbar" aria-valuemin={0} aria-valuemax={card.stops} aria-valuenow={card.stopsLoaded} aria-label="Stops loaded">
          <div className={`ld-fill${done ? ' ld-fill-loaded' : tone === 'queued' ? ' ld-fill-queued' : ''}`} style={{ width: `${Math.max(pct, 1)}%` }} />
        </div>
        <p className="ld-progress-label">
          {done ? 'Loaded · handed over to the driver' : card.stopsLoaded === 0 ? 'Not started' : `${card.stopsLoaded} of ${card.stops} stops loaded`}
          {card.openIssues > 0 ? ` · ${card.openIssues} open ${card.openIssues === 1 ? 'issue' : 'issues'}` : ''}
        </p>
      </div>
      <Link to={`/loader/trips/${card.loadTaskId}`} className={`ld-btn${primary && !done ? ' ld-btn-primary' : ''}`}>
        {action} <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </article>
  )
}
