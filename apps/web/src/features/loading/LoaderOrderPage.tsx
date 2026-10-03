import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Minus } from 'lucide-react'
import { ErrorState, LoadingState } from '../../components'
import { LoaderRequestError, clock, num, useLoadTask, useLoaderAction } from './loaderQueries'
import type { LoadLine, LoaderTaskDetail } from './loaderQueries'
import './loading.css'

/** The stop and order a line belongs to, from the server's stop grouping. */
export function findLine(detail: LoaderTaskDetail, lineId: number) {
  for (const stop of detail.stops) {
    const line = stop.lines.find(l => l.id === lineId)
    if (line) return { stop, line }
  }
  return null
}

/** Figma Loader · Order Loading (93:7810), Shortfall recorded (749:12866), All checked (767:12909). */
export function LoaderOrderPage() {
  const { taskId, lineId } = useParams()
  const id = Number(taskId)
  const task = useLoadTask(Number.isFinite(id) ? id : undefined)
  const action = useLoaderAction(id, task.data?.task.version)
  const navigate = useNavigate()

  if (task.isPending) return <LoadingState rows={4} label="Loading the order" />
  if (task.isError) return <ErrorState error={task.error} message="This order could not be loaded." onRetry={() => void task.refetch()} />
  const detail = task.data
  const t = detail.task
  const found = findLine(detail, Number(lineId))
  if (!found) return <ErrorState title="Order not on this manifest" message="This order is not on the current manifest for the trip." />
  const { stop, line } = found
  const locked = t.status !== 'loading' && t.status !== 'pending' || detail.card.awaitingAcknowledgement
  const counted = stop.lines.filter(l => l.status !== 'pending').length
  const pct = Math.round((counted / stop.lines.length) * 100)
  const issue = detail.issues.find(i => i.loadLineId === line.id && i.status === 'OPEN')
  const failure = action.error

  async function confirm() {
    const after = await action.mutateAsync({ kind: 'confirmLine', lineId: line.id })
    const next = after.stops.flatMap(s => s.lines).find(l => l.status === 'pending')
    navigate(next ? `/loader/trips/${t.id}/orders/${next.id}` : `/loader/trips/${t.id}`)
  }

  return (
    <div className="ld-page">
      <div className="ld-head">
        <Link to={`/loader/trips/${t.id}`} className="ld-back" aria-label="Back to the trip"><ArrowLeft size={20} /></Link>
        <div className="ld-head-text">
          <h1 className="ld-title ld-title-s">Load order {line.orderRef}</h1>
          <p className="ld-sub">Trip {t.tripIndex} · {t.vehicleId} · Stop {stop.stopNumber} · {stop.outletId}</p>
        </div>
        <span className={`ld-badge ${counted === stop.lines.length ? 'ld-badge-loaded' : 'ld-badge-loading'}`}>{counted} of {stop.lines.length} loaded</span>
      </div>

      {locked && (
        <div className="ld-alert" role="status">
          {detail.card.awaitingAcknowledgement ? `Manifest v${t.planVersion} changed. Acknowledge it on the trip before loading.`
            : t.status === 'superseded' ? 'This manifest was replaced. Open the current manifest from the trip.'
              : 'This trip is already handed over; counts can no longer change.'}
        </div>
      )}

      <div className="ld-grid">
        <div className="ld-col">
          <section className="ld-card" aria-label="Order to load">
            <div className="ld-list-head"><p className="ld-overline">Order to load</p>
              <span className="ld-list-meta">{line.status === 'pending' ? 'Not counted yet' : line.status === 'short' ? 'Loaded short' : 'Counted'}</span></div>
            <LineRow line={line} pending={action.isPending} disabled={locked} onConfirm={() => void confirm()} />
          </section>

          {issue && (
            <section className="ld-card ld-card-pad" aria-label="Shortfall recorded">
              <span className="ld-accent ld-accent-danger" />
              <div className="ld-row">
                <p className="ld-overline ld-grow">Shortfall recorded</p>
                <span className="ld-badge ld-badge-danger">{issue.holdsVehicle ? 'Vehicle held' : 'Sent short'}</span>
              </div>
              <p className="ld-stop-title">{issue.shortUnits} of {issue.orderedUnits} units {issue.kind === 'MISSING' ? 'missing' : issue.kind === 'DAMAGED' ? 'damaged' : 'wrong item'}</p>
              <p className="ld-stop-sub">Sent to the dispatcher — awaiting a decision. The store will see {issue.orderedUnits - issue.shortUnits} of {issue.orderedUnits} units on its receipt.</p>
            </section>
          )}

          {stop.lines.length > 1 && (
            <section className="ld-card" aria-label="Also at this stop">
              <div className="ld-list-head"><p className="ld-overline">Also at this stop</p><span className="ld-list-meta">Stop {stop.stopNumber} of {detail.stops.length}</span></div>
              {stop.lines.filter(l => l.id !== line.id).map(other => (
                <Link key={other.id} to={`/loader/trips/${t.id}/orders/${other.id}`} className="ld-stop">
                  <span className="ld-rank">{other.tempRequirement === 'chilled' ? 'C' : 'A'}</span>
                  <div><p className="ld-stop-title">{other.orderRef} · {other.tempRequirement}</p>
                    <p className="ld-stop-sub">{other.units} units · {num(other.weightKg, 0)} kg · {num(other.volumeM3, 2)} m³</p></div>
                  <span />
                  <span className={`ld-pill ${other.status === 'pending' ? 'ld-pill-wait' : other.status === 'short' ? 'ld-pill-short' : 'ld-pill-done'}`}>
                    {other.status === 'pending' ? 'Queued' : other.status === 'short' ? 'Short' : 'Loaded'}</span>
                </Link>
              ))}
            </section>
          )}
          <p className="ld-footnote">Manifest v{t.planVersion} · load in reverse delivery order</p>
        </div>

        <aside className="ld-side">
          <div className="ld-card ld-card-pad" aria-label="Outlet">
            <p className="ld-overline">Outlet</p>
            <p className="ld-card-title">{stop.outletId}</p>
            <p className="ld-card-sub">{stop.district} district · {line.tempRequirement}</p>
            <div>
              <div className="ld-kv">Departs <strong>{clock(t.plannedDepart)}</strong></div>
              <div className="ld-kv">Orders at stop <strong>{stop.lines.length}</strong></div>
              <div className="ld-kv">Weight <strong>{num(line.weightKg, 0)} kg</strong></div>
              <div className="ld-kv">Volume <strong>{num(line.volumeM3, 2)} m³</strong></div>
            </div>
          </div>
          <div className="ld-card ld-card-pad" aria-label="Loading progress">
            <p className="ld-overline">Stop progress</p>
            <p className="ld-percent">{pct}%</p>
            <div className="ld-track"><div className="ld-fill" style={{ width: `${pct}%` }} /></div>
            <p className="ld-progress-label">{counted} of {stop.lines.length} orders counted</p>
          </div>
          <div className="ld-note">
            <p className="ld-overline">Before you mark loaded</p>
            <p>Count the units against the manifest. Report a shortage first — do not adjust counts.</p>
          </div>
          {failure && <div className="ld-alert" role="alert">{failure.message}
            {failure instanceof LoaderRequestError && failure.code === 'MANIFEST_SUPERSEDED' && failure.currentTaskId &&
              <> <Link to={`/loader/trips/${failure.currentTaskId}`}>Open the current manifest</Link></>}</div>}
          {line.status === 'pending' && !locked && (
            <>
              <Link className="ld-btn" to={`/loader/trips/${t.id}/orders/${line.id}/shortfall`}>Report shortfall</Link>
              <button type="button" className="ld-btn ld-btn-primary" disabled={action.isPending} onClick={() => void confirm()}>
                {action.isPending ? 'Saving…' : `Confirm ${line.units} units loaded`}
              </button>
            </>
          )}
          {line.status !== 'pending' && <Link className="ld-btn ld-btn-primary" to={`/loader/trips/${t.id}`}>Back to the trip</Link>}
        </aside>
      </div>
    </div>
  )
}

function LineRow({ line, pending, disabled, onConfirm }: { line: LoadLine; pending: boolean; disabled: boolean; onConfirm: () => void }) {
  const isPending = line.status === 'pending'
  const short = line.status === 'short'
  return (
    <div className={`ld-item${isPending ? ' ld-item-pending' : ''}`}>
      <span className={`ld-check${short ? ' ld-check-short' : isPending ? '' : ' ld-check-on'}`} aria-hidden="true">
        {short ? <Minus size={16} /> : isPending ? null : <Check size={16} />}
      </span>
      <div>
        <p className="ld-stop-title">{line.orderRef} · {line.tempRequirement}</p>
        <p className="ld-stop-sub">{line.outletId} · {Number(line.weightKg).toLocaleString('en-GB')} kg · {Number(line.volumeM3).toLocaleString('en-GB')} m³{line.carried ? ' · count kept from the previous manifest' : ''}</p>
      </div>
      <div className={`ld-count${isPending ? ' ld-count-pending' : ''}`}>{isPending ? '—' : line.loadedUnits} / {line.units}<small>{isPending ? 'pending' : 'units'}</small></div>
      {isPending
        ? <button type="button" className="ld-pill ld-pill-now" disabled={pending || disabled} onClick={onConfirm}>Mark loaded</button>
        : <span className={`ld-pill ${short ? 'ld-pill-short' : 'ld-pill-done'}`}>{short ? 'Short' : 'Loaded'}</span>}
    </div>
  )
}
