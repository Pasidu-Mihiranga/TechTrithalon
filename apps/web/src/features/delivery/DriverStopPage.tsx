import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, ChevronRight, Clock, Info, MapPin, Navigation, Package, Snowflake, Truck, XCircle } from 'lucide-react'
import { ActionError, DriverHeader, Failure, Loading, NetPill, OfflineNotice } from './DriverParts'
import { clock, num, OUTCOME_LABELS, plural, timeOf, useDriverAction, useDriverTrip } from './driverQueries'
import type { DriverStop, DriverTripDetail } from './driverQueries'
import './driver.css'

const DOCK_LABELS: Record<string, string> = { street: 'Curbside delivery · street access, no dock', rear_dock: 'Rear dock', mall_bay: 'Mall delivery bay' }

/** Figma Driver · Stop Details (58:5317) and Stop Completed (60:5390). */
export function DriverStopPage() {
  const { tripIndex: tripParam, seq: seqParam } = useParams()
  const tripIndex = Number(tripParam)
  const seq = Number(seqParam)
  const trip = useDriverTrip(tripIndex)
  const [showSummary, setShowSummary] = useState(false)
  if (trip.isPending) return <Loading label="Loading the stop" />
  if (trip.isError) return <Failure error={trip.error} back="/driver" message="The stop could not be loaded." onRetry={() => void trip.refetch()} />
  const detail = trip.data
  const stop = detail.stops.find(s => s.seq === seq)
  const base = `/driver/trips/${tripIndex}`
  if (!stop) return <Failure error={{ status: 404 }} back={base} message="This stop is not on the trip." />
  const allRecorded = stop.recorded === stop.orders.length
  if (stop.status === 'ARRIVED' && allRecorded && !showSummary) return <StopCompleted detail={detail} stop={stop} onSummary={() => setShowSummary(true)} />
  return <StopDetails detail={detail} stop={stop} base={base} />
}

function StopDetails({ detail, stop, base }: { detail: DriverTripDetail; stop: DriverStop; base: string }) {
  const navigate = useNavigate()
  const action = useDriverAction(detail.card)
  const running = detail.card.state === 'IN_PROGRESS'
  const isCurrent = stop.seq === detail.currentStopSeq
  const nextOrder = stop.orders.find(o => !o.outcome)
  const chilled = stop.orders.filter(o => o.temp === 'chilled').map(o => o.orderRef)
  const sub = stop.arrivedAt ? `Arrived · ${timeOf(stop.arrivedAt)}${stop.departedAt ? ` · Left ${timeOf(stop.departedAt)}` : ''}`
    : stop.eta ? `ETA ${clock(stop.eta)}` : `Planned ${clock(stop.plannedArrival)}`
  return (
    <div className="dv-page">
      <DriverHeader back={base} title={`Stop ${stop.seq} of ${detail.stops.length}`} sub={sub}>
        <NetPill />
        {isCurrent ? <span className="dv-pill dv-pill-brand">Current Stop</span> : stop.status === 'COMPLETED' ? <span className="dv-pill dv-pill-good">Done</span> : null}
      </DriverHeader>
      <div className="dv-body dv-body-tight">
        <OfflineNotice />
        <section className="dv-card dv-card-raised" aria-label="Stop">
          <div className="dv-row">
            <span className="dv-icon-tile dv-icon-tile-brand"><MapPin size={20} aria-hidden="true" /></span>
            <div className="dv-grow">
              <p className="dv-item-title">{stop.outletId}</p>
              <p className="dv-item-sub">{stop.district} district · {detail.card.brand}</p>
            </div>
          </div>
          <div className="dv-chips">
            <span className="dv-chip"><Package size={14} aria-hidden="true" />{plural(stop.orders.length, 'order')}</span>
            <span className="dv-chip"><Truck size={14} aria-hidden="true" />{num(stop.weightKg)} kg · {plural(stop.units, 'unit')}</span>
          </div>
          <div className="dv-info"><Clock size={16} aria-hidden="true" />
            {stop.windowOpen ? `Delivery window: ${clock(stop.windowOpen)} – ${clock(stop.windowClose)}` : 'No delivery window recorded'}
            {stop.late ? ' · projected after the window closes' : ''}</div>
          <div className="dv-info"><Info size={16} aria-hidden="true" />
            {DOCK_LABELS[stop.dockType] ?? stop.dockType}{stop.parkingConstraint && stop.parkingConstraint !== 'normal' ? ` · parking: ${stop.parkingConstraint.replace(/_/g, ' ')}` : ''}</div>
          {chilled.length > 0 ? (
            <div className="dv-info dv-info-cold"><Snowflake size={16} aria-hidden="true" />{chilled.join(', ')} {chilled.length === 1 ? 'is' : 'are'} chilled — keep refrigerated until handover</div>
          ) : null}
        </section>
        <section className="dv-list" aria-label="Orders at this stop">
          <p className="dv-overline">Orders at this stop</p>
          {stop.orders.map(order => (
            <Link key={order.orderId} to={`${base}/orders/${order.orderId}`} className="dv-item">
              <span className={`dv-icon-tile${order.outcome?.outcome === 'DELIVERED' ? ' dv-icon-tile-good' : ''}`}>
                {order.outcome ? (order.outcome.outcome === 'FAILED' ? <XCircle size={20} aria-hidden="true" /> : <CheckCircle2 size={20} aria-hidden="true" />) : <Package size={20} aria-hidden="true" />}
              </span>
              <div className="dv-grow">
                <p className="dv-item-title dv-mono">{order.orderRef}</p>
                <p className="dv-item-sub">{order.outcome ? OUTCOME_LABELS[order.outcome.outcome] : `${plural(order.loadedUnits, 'unit')} · ${num(order.weightKg)} kg`}</p>
              </div>
              <ChevronRight size={18} className="dv-chevron" aria-hidden="true" />
            </Link>
          ))}
        </section>
        {running && stop.status === 'PENDING' ? (
          <>
            <button type="button" className="dv-btn dv-btn-primary" disabled={action.isPending}
              onClick={() => action.mutate({ kind: 'arrive', outletId: stop.outletId })}>
              <MapPin size={20} aria-hidden="true" />{action.isPending ? 'Saving…' : "I've Arrived"}
            </button>
            {!isCurrent ? <p className="dv-meta dv-center">This is not the next stop in the plan; arriving here is recorded as out of sequence.</p> : null}
          </>
        ) : null}
        {running && stop.status === 'ARRIVED' && nextOrder ? (
          <button type="button" className="dv-btn dv-btn-primary" onClick={() => navigate(`${base}/orders/${nextOrder.orderId}`)}>Start Delivery</button>
        ) : null}
        {running && stop.status === 'ARRIVED' && !nextOrder ? <DepartButton detail={detail} stop={stop} /> : null}
        <ActionError error={action.error} />
      </div>
    </div>
  )
}

function DepartButton({ detail, stop }: { detail: DriverTripDetail; stop: DriverStop }) {
  const navigate = useNavigate()
  const action = useDriverAction(detail.card)
  const base = `/driver/trips/${detail.card.tripIndex}`
  const next = detail.stops.find(s => s.status === 'PENDING' && s.seq !== stop.seq)
  return (
    <>
      <button type="button" className="dv-btn dv-btn-primary" disabled={action.isPending}
        onClick={() => {
          // mutateAsync: saving offline updates the screen at once and may unmount this button first.
          action.mutateAsync({ kind: 'depart', outletId: stop.outletId }).then((after) => {
            const upcoming = after.detail.stops.find(s => s.seq === after.detail.currentStopSeq)
            navigate(upcoming ? `${base}/route` : `${base}/complete`)
          }, () => undefined)
        }}>
        <Navigation size={20} aria-hidden="true" />{action.isPending ? 'Saving…' : next ? 'Next Stop' : 'Finish Stops'}
      </button>
      <ActionError error={action.error} />
    </>
  )
}

function StopCompleted({ detail, stop, onSummary }: { detail: DriverTripDetail; stop: DriverStop; onSummary: () => void }) {
  const issues = stop.orders.filter(o => o.outcome && o.outcome.outcome !== 'DELIVERED').length
  return (
    <div className="dv-page">
      <div className="dv-done">
        <span className="dv-done-icon dv-done-good"><CheckCircle2 size={40} aria-hidden="true" /></span>
        <h1 className="dv-done-title">Stop completed</h1>
        <p className="dv-done-sub">{stop.outletId} · {stop.district}</p>
      </div>
      <div className="dv-body dv-body-tight">
        <section className="dv-card dv-card-raised" aria-label="Orders completed">
          <p className="dv-card-title dv-center">{stop.recorded} / {stop.orders.length} orders completed</p>
          {stop.orders.map(o => (
            <div key={o.orderId} className="dv-check-row">
              {o.outcome?.outcome === 'DELIVERED' ? <CheckCircle2 size={18} className="dv-good-text" aria-hidden="true" /> : <XCircle size={18} className="dv-bad-text" aria-hidden="true" />}
              <span className="dv-mono">{o.orderRef}</span>
              <span className={o.outcome?.outcome === 'DELIVERED' ? 'dv-good-text' : 'dv-bad-text'}>{o.outcome ? OUTCOME_LABELS[o.outcome.outcome] : 'Pending'}</span>
            </div>
          ))}
          <div className="dv-info"><Info size={16} aria-hidden="true" />{plural(issues, 'issue')} reported at this stop</div>
        </section>
        <DepartButton detail={detail} stop={stop} />
        <button type="button" className="dv-btn dv-btn-outline" onClick={onSummary}>View Stop Summary</button>
      </div>
    </div>
  )
}
