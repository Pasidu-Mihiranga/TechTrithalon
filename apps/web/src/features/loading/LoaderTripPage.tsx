import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { ErrorState, LoadingState } from '../../components'
import { LoaderRequestError, clock, num, tripBadge, useLoadTask, useLoaderAction } from './loaderQueries'
import type { LoaderStop, LoaderTaskDetail } from './loaderQueries'
import './loading.css'

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`

/** Figma Loader · Trip (93:7636), Ready for handover (567:7166), Trip completion (94:7621), Manifest update (841:19967). */
export function LoaderTripPage() {
  const { taskId } = useParams()
  const id = Number(taskId)
  const task = useLoadTask(Number.isFinite(id) ? id : undefined)
  const action = useLoaderAction(id, task.data?.task.version)
  const navigate = useNavigate()

  if (task.isPending) return <LoadingState rows={5} label="Loading the manifest" />
  if (task.isError) return <ErrorState error={task.error} message="This trip could not be loaded." onRetry={() => void task.refetch()} />
  const detail = task.data
  const t = detail.task
  const failure = action.error instanceof LoaderRequestError ? action.error : action.error

  if (t.status === 'superseded') return <Replaced detail={detail} />
  if (detail.card.awaitingAcknowledgement) return <ManifestUpdate detail={detail} pending={action.isPending} failure={failure}
    onAcknowledge={() => action.mutate({ kind: 'acknowledge' })} />
  if (t.status === 'loaded') return <TripLoaded detail={detail} />

  const next = nextLine(detail.stops)
  const allCounted = detail.card.ordersChecked === detail.card.orders
  const badge = tripBadge(detail.card)

  return (
    <div className="ld-page">
      <Header detail={detail} badge={<span className={`ld-badge ld-badge-${allCounted && detail.handoverBlockers.length === 0 ? 'loaded' : badge.tone}`}>
        {allCounted && detail.handoverBlockers.length === 0 ? 'All stops loaded' : badge.label}</span>} />
      <div className="ld-grid">
        <section className="ld-card" aria-label="Load order">
          <div className="ld-list-head"><p className="ld-overline">Load order · rear → front</p><span className="ld-list-meta">Stop 1 loads last</span></div>
          {detail.stops.map(stop => <StopRow key={stop.stopNumber} stop={stop} taskId={t.id} current={next?.stop.stopNumber === stop.stopNumber} />)}
        </section>
        <aside className="ld-side">
          <Capacity detail={detail} />
          <div className="ld-note">
            <p className="ld-overline">Load from rear to front</p>
            <p>Stop 1 is delivered first, so it loads last. Check each order count before marking it loaded.</p>
          </div>
          {failure && <div className="ld-alert" role="alert">{failure.message}
            {failure instanceof LoaderRequestError && failure.blockers.length > 0 && <ul>{failure.blockers.map(b => <li key={b}>{b}</li>)}</ul>}</div>}
          {next ? (
            <Link className="ld-btn ld-btn-primary" to={`/loader/trips/${t.id}/orders/${next.line.id}`}>Load Stop {next.stop.stopNumber}</Link>
          ) : (
            <>
              {detail.handoverBlockers.length > 0 && <div className="ld-alert" role="status"><strong>Not ready for handover</strong>
                <ul>{detail.handoverBlockers.map(b => <li key={b}>{b}</li>)}</ul></div>}
              <button type="button" className="ld-btn ld-btn-primary" disabled={action.isPending || detail.handoverBlockers.length > 0}
                onClick={() => action.mutate({ kind: 'markLoaded' })}>
                {action.isPending ? 'Saving…' : 'Mark trip as loaded'}
              </button>
            </>
          )}
          <button type="button" className="ld-btn" onClick={() => navigate('/loader')}>Back to trips</button>
        </aside>
      </div>
    </div>
  )
}

/** The next order to count, in loading order (last stop first). */
function nextLine(stops: LoaderStop[]) {
  for (const stop of stops) {
    const line = stop.lines.find(l => l.status === 'pending')
    if (line) return { stop, line }
  }
  return null
}

function Header({ detail, badge }: { detail: LoaderTaskDetail; badge?: React.ReactNode }) {
  const t = detail.task
  return (
    <div className="ld-head">
      <Link to="/loader" className="ld-back" aria-label="Back to trips"><ArrowLeft size={20} /></Link>
      <div className="ld-head-text">
        <h1 className="ld-title ld-title-s">Trip {t.tripIndex} · {t.vehicleId}</h1>
        <p className="ld-sub">{t.brand} · {t.district} district · departs {clock(t.plannedDepart)}{t.driverName ? ` · ${t.driverName}` : ''}</p>
      </div>
      {badge}
    </div>
  )
}

function StopRow({ stop, taskId, current }: { stop: LoaderStop; taskId: number; current: boolean }) {
  const done = stop.status === 'loaded'
  const short = stop.lines.some(l => l.status === 'short')
  const first = stop.lines.find(l => l.status === 'pending') ?? stop.lines[0]
  const temps = [...new Set(stop.lines.map(l => l.tempRequirement))].join(' · ')
  return (
    <Link to={`/loader/trips/${taskId}/orders/${first.id}`} className={`ld-stop${current ? ' ld-stop-current' : ''}`}>
      <span className={`ld-rank${done ? ' ld-rank-done' : current ? ' ld-rank-current' : ''}`}>{ordinal(stop.loadPosition)}</span>
      <div>
        <p className="ld-stop-title">{stop.outletId}</p>
        <p className="ld-stop-sub">Stop {stop.stopNumber} · {stop.district}{stop.lines.length > 1 ? ` · ${stop.lines.length} orders` : ''}</p>
        <p className="ld-stop-orders">{stop.lines.map(l => `${l.orderRef} ${l.status === 'pending' ? 'pending' : l.status === 'short' ? `${l.loadedUnits}/${l.units} short` : 'loaded'}`).join(' · ')}</p>
      </div>
      <div className="ld-metric">{num(stop.volumeM3)} m³ · {num(stop.weightKg, 0)} kg<small>{temps}</small></div>
      <span className={`ld-pill ${short ? 'ld-pill-short' : done ? 'ld-pill-done' : current ? 'ld-pill-now' : 'ld-pill-wait'}`}>
        {short && done ? 'Loaded short' : done ? 'Loaded' : current ? 'Load now' : stop.status === 'partial' ? 'In progress' : 'Waiting'}
      </span>
    </Link>
  )
}

function Capacity({ detail }: { detail: LoaderTaskDetail }) {
  const c = detail.card
  const bar = (used: number, cap?: number | null) => (cap ? Math.min(100, Math.round((used / cap) * 100)) : 0)
  return (
    <div className="ld-card" aria-label="Trip capacity">
      <div className="ld-list-head"><p className="ld-overline">Trip capacity</p><span className="ld-list-meta">Manifest v{detail.task.planVersion}</span></div>
      <div className="ld-capacity">
        <div><div className="ld-cap-row">Volume <strong>{num(c.volumeM3)} / {num(c.volumeCapM3)} m³</strong></div>
          <div className="ld-track"><div className="ld-fill" style={{ width: `${bar(c.volumeM3, c.volumeCapM3)}%` }} /></div></div>
        <div><div className="ld-cap-row">Weight <strong>{num(c.weightKg, 0)} / {num(c.weightCapKg, 0)} kg</strong></div>
          <div className="ld-track"><div className="ld-fill ld-fill-blue" style={{ width: `${bar(c.weightKg, c.weightCapKg)}%` }} /></div></div>
        <div><div className="ld-cap-row">Stops loaded <strong>{c.stopsLoaded} / {c.stops}</strong></div>
          <div className="ld-track"><div className={`ld-fill${c.stopsLoaded === c.stops ? ' ld-fill-loaded' : ''}`} style={{ width: `${bar(c.stopsLoaded, c.stops)}%` }} /></div></div>
        <p className="ld-footnote">{c.stopsLoaded} of {c.stops} stops loaded · {c.orders} orders</p>
      </div>
    </div>
  )
}

function ManifestUpdate({ detail, pending, failure, onAcknowledge }: { detail: LoaderTaskDetail; pending: boolean; failure: Error | null; onAcknowledge: () => void }) {
  const t = detail.task
  const removedLoaded = detail.changes.filter(c => c.change === 'REMOVED' && (c.loadedUnits ?? 0) > 0)
  return (
    <section className="ld-modal" aria-label={`Manifest update v${t.planVersion}`}>
      <h1 className="ld-title ld-title-s">Manifest update · v{t.planVersion}</h1>
      <p className="ld-sub">Trip {t.tripIndex} · {t.vehicleId} · replaces v{detail.replacedPlanVersion ?? '—'}</p>
      <ul>
        {detail.changes.length === 0 && <li>No order or stop changed on this vehicle; the plan version changed elsewhere.</li>}
        {detail.changes.map(c => (
          <li key={`${c.change}-${c.orderRef}`}>
            {c.change === 'ADDED' && `${c.orderRef} (${c.outletId}) added at stop ${c.stopAfter}.`}
            {c.change === 'REMOVED' && `${c.orderRef} (${c.outletId}) removed from this trip${(c.loadedUnits ?? 0) > 0 ? ` — take its ${c.loadedUnits} loaded units off the vehicle` : ''}.`}
            {c.change === 'RESEQUENCED' && `${c.orderRef} moves from stop ${c.stopBefore} to stop ${c.stopAfter}.`}
          </li>
        ))}
        {detail.task.lines.some(l => l.carried) && <li>Counts already made for orders that stay on this trip are kept.</li>}
        <li>Acknowledge so the dispatcher knows this device has the current plan.</li>
      </ul>
      {removedLoaded.length > 0 && <div className="ld-alert" role="alert">Unload {removedLoaded.map(c => c.orderRef).join(', ')} before continuing.</div>}
      {failure && <div className="ld-alert" role="alert">{failure.message}</div>}
      <div className="ld-modal-actions">
        <Link className="ld-btn" to="/loader">Back to trips</Link>
        <button type="button" className="ld-btn ld-btn-primary" disabled={pending} onClick={onAcknowledge}>
          {pending ? 'Saving…' : `Acknowledge v${t.planVersion}`}
        </button>
      </div>
    </section>
  )
}

function TripLoaded({ detail }: { detail: LoaderTaskDetail }) {
  const t = detail.task
  const c = detail.card
  const loadedUnits = t.lines.reduce((sum, l) => sum + (l.loadedUnits ?? 0), 0)
  const orderedUnits = t.lines.reduce((sum, l) => sum + l.units, 0)
  const shortLines = t.lines.filter(l => l.status === 'short')
  return (
    <section className="ld-modal" aria-label={`Trip ${t.tripIndex} loaded`}>
      <span className="ld-rank ld-rank-done ld-done-icon"><Check size={34} aria-hidden="true" /></span>
      <h1 className="ld-title ld-title-s ld-center">Trip {t.tripIndex} loaded</h1>
      <p className="ld-sub ld-center">{t.vehicleId} · {c.orders} orders · all {c.stops} stops checked</p>
      <span className="ld-badge ld-badge-loaded ld-self-center">Ready for driver</span>
      <div className="ld-kpis">
        <div className="ld-kpi"><strong>{c.ordersChecked} / {c.orders}</strong><small>Orders counted</small></div>
        <div className="ld-kpi"><strong>{loadedUnits} / {orderedUnits}</strong><small>Units loaded</small></div>
        <div className="ld-kpi"><strong>{num(c.volumeM3)} m³</strong><small>Volume planned</small></div>
      </div>
      <ul>
        <li>{t.driverName ?? 'No driver linked to this vehicle'} · departs {clock(t.plannedDepart)}.</li>
        <li>Manifest v{t.planVersion} handed over {t.loadedAt ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit' }).format(new Date(t.loadedAt)) : ''}.</li>
        {shortLines.length > 0 && <li>{shortLines.map(l => `${l.orderRef} sent ${l.loadedUnits} of ${l.units}`).join('; ')}.</li>}
      </ul>
      <div className="ld-modal-actions">
        {shortLines.length > 0 ? <Link className="ld-btn" to="/loader/issues">Review shortfall</Link> : <span />}
        <Link className="ld-btn ld-btn-primary" to="/loader">Back to Home <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    </section>
  )
}

function Replaced({ detail }: { detail: LoaderTaskDetail }) {
  const t = detail.task
  return (
    <section className="ld-modal" aria-label="Manifest replaced">
      <h1 className="ld-title ld-title-s">Manifest v{t.planVersion} was replaced</h1>
      <p className="ld-sub">Trip {t.tripIndex} · {t.vehicleId}. Do not load from this version.</p>
      <ul>
        <li>{detail.currentTaskId ? 'This vehicle and trip continue on the current manifest.' : 'This trip is no longer on the current plan. Unload anything already on the vehicle for it and check with the dispatcher.'}</li>
      </ul>
      <div className="ld-modal-actions">
        <Link className="ld-btn" to="/loader">Back to trips</Link>
        {detail.currentTaskId ? <Link className="ld-btn ld-btn-primary" to={`/loader/trips/${detail.currentTaskId}`}>Open current manifest</Link> : <span />}
      </div>
    </section>
  )
}
