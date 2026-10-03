import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, ChevronDown, Clock, Route, Truck, User } from 'lucide-react'
import { DriverHeader, Failure, Loading, NetPill } from './DriverParts'
import { dayOf, ISSUE_LABELS, OUTCOME_LABELS, timeOf, useDriverOrder } from './driverQueries'
import './driver.css'

/** Figma Driver · Delivery Details (61:5543) with the proof preview sheet (206:1181). */
export function DriverDeliveryDetailPage() {
  const orderId = Number(useParams().orderId)
  const order = useDriverOrder(orderId)
  const [showProof, setShowProof] = useState(false)
  if (order.isPending) return <Loading label="Loading the delivery record" />
  if (order.isError) return <Failure error={order.error} back="/driver/deliveries" message="The delivery record could not be loaded." onRetry={() => void order.refetch()} />
  const d = order.data
  const outcome = d.outcome
  return (
    <div className="dv-page">
      <DriverHeader back="/driver/deliveries" title={d.orderRef} sub="Delivery record"><NetPill /></DriverHeader>
      <div className="dv-body dv-body-tight">
        <section className="dv-card dv-card-raised" aria-label="Outlet">
          <div className="dv-row">
            <div className="dv-grow"><p className="dv-item-title">{d.outletId}</p><p className="dv-item-sub">{d.district} · {d.brand}</p></div>
            <span className={`dv-pill dv-pill-${!outcome ? 'muted' : outcome.outcome === 'DELIVERED' ? 'good' : 'bad'}`}>{outcome ? OUTCOME_LABELS[outcome.outcome] : 'Not delivered yet'}</span>
          </div>
        </section>
        <ol className="dv-timeline" aria-label="Timeline">
          {d.timeline.map(event => (
            <li key={event.label}><CheckCircle2 size={20} aria-hidden="true" /><div><strong>{event.label}</strong><span>{dayOf(event.at)} · {timeOf(event.at)}</span></div></li>
          ))}
        </ol>
        <section className="dv-kv" aria-label="Delivery">
          <div className="dv-kv-row"><span><Route size={16} aria-hidden="true" />Trip</span><strong>Trip {d.tripIndex}</strong></div>
          <div className="dv-kv-row"><span><Truck size={16} aria-hidden="true" />Vehicle</span><strong>{d.vehicleId}</strong></div>
          <div className="dv-kv-row"><span><Clock size={16} aria-hidden="true" />Recorded at</span><strong>{outcome ? timeOf(outcome.recordedAt) : '—'}</strong></div>
          <div className="dv-kv-row"><span><User size={16} aria-hidden="true" />Recipient</span><strong>{outcome?.recipientName ?? '—'}</strong></div>
        </section>
        <section className="dv-kv" aria-label="Units">
          <div className="dv-kv-head"><span>Units</span></div>
          <div className="dv-kv-row"><span>Ordered</span><strong>{d.units}</strong></div>
          <div className="dv-kv-row"><span>Loaded</span><strong>{d.loadedUnits}</strong></div>
          <div className="dv-kv-row"><span>Handed over</span><strong>{outcome ? outcome.deliveredUnits : '—'}</strong></div>
          {outcome?.issueKind ? <div className="dv-kv-row"><span>Issue</span><strong>{ISSUE_LABELS[outcome.issueKind]}</strong></div> : null}
          {outcome?.notes ? <div className="dv-kv-row"><span>Notes</span><strong>{outcome.notes}</strong></div> : null}
        </section>
        {d.proofs.length > 0 ? (
          <>
            <button type="button" className="dv-info dv-info-good dv-choice" aria-expanded={showProof} onClick={() => setShowProof(v => !v)}>
              <CheckCircle2 size={18} aria-hidden="true" />Proof of delivery confirmed ({d.proofs.length})<ChevronDown size={16} aria-hidden="true" />
            </button>
            {showProof ? (
              <section className="dv-card" aria-label="Proof of delivery">
                {d.proofs.map(proof => proof.url
                  ? <img key={proof.id} src={proof.url} alt={proof.kind === 'PHOTO' ? 'Proof photo' : 'Recipient signature'} className="dv-pod-image" width={proof.width} height={proof.height} />
                  : <p key={proof.id} className="dv-item-sub">{proof.kind === 'PHOTO' ? 'Photo' : 'Signature'} stored · preview needs proof storage to be configured</p>)}
              </section>
            ) : null}
          </>
        ) : outcome && outcome.outcome !== 'FAILED' ? <div className="dv-info">No proof file was attached to this delivery.</div> : null}
      </div>
    </div>
  )
}
