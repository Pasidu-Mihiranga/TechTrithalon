import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, Minus, Package, Plus } from 'lucide-react'
import { ErrorState, LoadingState } from '../../components'
import { SHORTFALL_LABELS, useLoadTask, useLoaderAction } from './loaderQueries'
import type { ShortfallKind } from './loaderQueries'
import { findLine } from './LoaderOrderPage'
import './loading.css'

const KINDS: ShortfallKind[] = ['MISSING', 'DAMAGED', 'WRONG_ITEM']

/** Figma Loader · Report Shortfall (553:7136) with its kind, quantity and hold variants. */
export function LoaderShortfallPage() {
  const { taskId, lineId } = useParams()
  const id = Number(taskId)
  const task = useLoadTask(Number.isFinite(id) ? id : undefined)
  const action = useLoaderAction(id, task.data?.task.version)
  const navigate = useNavigate()
  const [kind, setKind] = useState<ShortfallKind>('MISSING')
  const [shortUnits, setShortUnits] = useState(1)
  const [holds, setHolds] = useState(false)
  const [note, setNote] = useState('')

  if (task.isPending) return <LoadingState rows={4} label="Loading the order" />
  if (task.isError) return <ErrorState error={task.error} message="This order could not be loaded." onRetry={() => void task.refetch()} />
  const detail = task.data
  const t = detail.task
  const found = findLine(detail, Number(lineId))
  if (!found) return <ErrorState title="Order not on this manifest" message="This order is not on the current manifest for the trip." />
  const { stop, line } = found
  const units = line.units
  const quantity = Math.min(Math.max(shortUnits, 1), units)
  const blocked = line.status !== 'pending' || detail.card.awaitingAcknowledgement || (t.status !== 'pending' && t.status !== 'loading')

  async function send() {
    await action.mutateAsync({ kind: 'shortfall', lineId: line.id,
      body: { kind, shortUnits: quantity, holdsVehicle: holds, note: note.trim() || undefined } })
    navigate(`/loader/trips/${t.id}/orders/${line.id}`)
  }

  return (
    <div className="ld-page">
      <div className="ld-head">
        <Link to={`/loader/trips/${t.id}/orders/${line.id}`} className="ld-back" aria-label="Back to the order"><ArrowLeft size={20} /></Link>
        <div className="ld-head-text">
          <h1 className="ld-title ld-title-s">Report a shortfall</h1>
          <p className="ld-sub">{line.orderRef} · {stop.outletId} · Trip {t.tripIndex} · {t.vehicleId}</p>
        </div>
        <span className="ld-badge ld-badge-loading">Before departure</span>
      </div>

      {blocked && <div className="ld-alert" role="status">This order can no longer be reported here: it is already counted, the manifest changed, or the trip was handed over.</div>}

      <div className="ld-grid">
        <div className="ld-col">
          <section className="ld-card" aria-label="Affected order">
            <div className="ld-list-head"><p className="ld-overline">Affected order</p></div>
            <div className="ld-item ld-item-icon">
              <span className="ld-rank" aria-hidden="true"><Package size={18} /></span>
              <div><p className="ld-stop-title">{line.orderRef} · {line.tempRequirement}</p>
                <p className="ld-stop-sub">{units} units on manifest · stop {stop.stopNumber}</p></div>
            </div>
          </section>

          <section className="ld-card" aria-label="What went wrong">
            <div className="ld-list-head"><p className="ld-overline">What went wrong</p></div>
            <div className="ld-seg-row" role="group" aria-label="What went wrong">
              {KINDS.map(k => <button key={k} type="button" className="ld-seg" aria-pressed={kind === k} onClick={() => setKind(k)}>{SHORTFALL_LABELS[k]}</button>)}
            </div>
          </section>

          <section className="ld-card" aria-label="Quantity short">
            <div className="ld-list-head"><p className="ld-overline">Quantity short</p><span className="ld-list-meta">of {units} units</span></div>
            <div className="ld-stepper">
              <button type="button" className="ld-btn" aria-label="One unit fewer" disabled={quantity <= 1} onClick={() => setShortUnits(quantity - 1)}><Minus size={18} /></button>
              <div className="ld-stepper-value" aria-live="polite">{quantity}<small>{quantity === 1 ? 'unit short' : 'units short'}</small></div>
              <button type="button" className="ld-btn" aria-label="One unit more" disabled={quantity >= units} onClick={() => setShortUnits(quantity + 1)}><Plus size={18} /></button>
            </div>
            <div className="ld-quick" role="group" aria-label="Quick quantity">
              {[1, 2, 3].filter(n => n <= units).map(n => (
                <button key={n} type="button" aria-pressed={quantity === n} onClick={() => setShortUnits(n)}>{n} {n === 1 ? 'unit' : 'units'}</button>
              ))}
            </div>
            <label className="visually-hidden" htmlFor="shortfall-note">Note for the dispatcher</label>
            <textarea id="shortfall-note" className="ld-textarea" maxLength={500} placeholder="Note for the dispatcher (optional)"
              value={note} onChange={e => setNote(e.target.value)} />
          </section>

          <section className="ld-card" aria-label="Photo">
            <div className="ld-list-head"><p className="ld-overline">Photo</p><span className="ld-list-meta">Optional</span></div>
            <div className="ld-unavailable"><Camera size={16} aria-hidden="true" /> Photo upload is not available yet; it arrives with proof-of-delivery storage.</div>
          </section>
        </div>

        <aside className="ld-side">
          <section className="ld-card" aria-label="Blocks departure?">
            <div className="ld-list-head"><p className="ld-overline">Blocks departure?</p></div>
            <div className="ld-capacity" role="group" aria-label="Blocks departure?">
              <button type="button" className={`ld-btn${!holds ? ' ld-btn-primary' : ''}`} aria-pressed={!holds} onClick={() => setHolds(false)}>No — send short</button>
              <button type="button" className={`ld-btn${holds ? ' ld-btn-primary' : ''}`} aria-pressed={holds} onClick={() => setHolds(true)}>Yes — hold vehicle</button>
            </div>
          </section>
          <div className="ld-callout">
            <p className="ld-overline">What happens next</p>
            <p className="ld-callout-text">
              The dispatcher is told before departure{holds ? `, and ${t.vehicleId} waits at the dock until they decide` : ''}.
              {` ${stop.outletId} will see ${units - quantity} of ${units} units on its receipt.`}
            </p>
          </div>
          {action.error && <div className="ld-alert" role="alert">{action.error.message}</div>}
          <Link className="ld-btn" to={`/loader/trips/${t.id}/orders/${line.id}`}>Cancel</Link>
          <button type="button" className="ld-btn ld-btn-primary" disabled={blocked || action.isPending} onClick={() => void send()}>
            {action.isPending ? 'Sending…' : 'Send to dispatcher'}
          </button>
        </aside>
      </div>
    </div>
  )
}
