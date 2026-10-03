import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Check, CheckCircle2, Clock, Package } from 'lucide-react'
import { DriverHeader, Failure, Loading, NetPill, OfflineNotice } from './DriverParts'
import { clock, ISSUE_LABELS, num, OUTCOME_LABELS, plural, timeOf, useDriverTrip } from './driverQueries'
import type { DriverOrder, DriverStop, DriverTripDetail } from './driverQueries'
import './driver.css'

export function findOrder(detail: DriverTripDetail | undefined, orderId: number): { stop: DriverStop; order: DriverOrder } | undefined {
  for (const stop of detail?.stops ?? []) {
    const order = stop.orders.find(o => o.orderId === orderId)
    if (order) return { stop, order }
  }
  return undefined
}

/** Figma Driver · Order Delivery (58:5393): what is on board for this order, then report an issue or deliver. */
export function DriverOrderPage() {
  const params = useParams()
  const tripIndex = Number(params.tripIndex)
  const orderId = Number(params.orderId)
  const navigate = useNavigate()
  const trip = useDriverTrip(tripIndex)
  if (trip.isPending) return <Loading label="Loading the order" />
  if (trip.isError) return <Failure error={trip.error} back="/driver" message="The order could not be loaded." onRetry={() => void trip.refetch()} />
  const found = findOrder(trip.data, orderId)
  const base = `/driver/trips/${tripIndex}`
  if (!found) return <Failure error={{ status: 404 }} back={base} message="This order is not on the trip." />
  const { stop, order } = found
  const stopPath = `${base}/stops/${stop.seq}`
  const atStop = stop.status === 'ARRIVED'
  const short = order.loadedUnits < order.units

  return (
    <div className="dv-page">
      <DriverHeader back={stopPath} title={order.orderRef} sub={`${stop.outletId} · ${stop.district}`}>
        <NetPill />
        {order.outcome ? <span className={`dv-pill dv-pill-${order.outcome.outcome === 'DELIVERED' ? 'good' : 'bad'}`}>{OUTCOME_LABELS[order.outcome.outcome]}</span>
          : atStop ? <span className="dv-pill dv-pill-brand">In Progress</span> : null}
      </DriverHeader>
      <div className="dv-body dv-body-tight">
        <OfflineNotice />
        <div className="dv-chips">
          <span className="dv-chip"><Clock size={14} aria-hidden="true" />{stop.windowOpen ? `${clock(stop.windowOpen)} – ${clock(stop.windowClose)}` : 'No window'}</span>
          <span className="dv-chip"><Package size={14} aria-hidden="true" />{plural(order.loadedUnits, 'unit')}</span>
        </div>
        <section className="dv-kv" aria-label="Order contents">
          <div className="dv-kv-head"><span>Order ({plural(order.units, 'unit')})</span><span className="dv-overline">Planned</span></div>
          <div className="dv-kv-row"><span>Units ordered</span><strong className="dv-mono">{order.units}</strong></div>
          <div className="dv-kv-row"><span>Loaded at the depot</span><strong className="dv-mono">{order.loadedUnits}</strong></div>
          <div className="dv-kv-row"><span>Weight</span><strong className="dv-mono">{num(order.weightKg, 1)} kg</strong></div>
          <div className="dv-kv-row"><span>Volume</span><strong className="dv-mono">{num(order.volumeM3, 2)} m³</strong></div>
          <div className="dv-kv-row"><span>Temperature</span><strong>{order.temp === 'chilled' ? 'Chilled' : 'Ambient'}</strong></div>
        </section>
        {short ? (
          <div className="dv-info dv-info-warn"><AlertTriangle size={16} aria-hidden="true" />Sent short: {order.loadedUnits} of {order.units} units left the depot. Deliver what is on board.</div>
        ) : (
          <div className="dv-info dv-info-good"><CheckCircle2 size={16} aria-hidden="true" />Loaded in full at the depot</div>
        )}
        {order.outcome ? (
          <section className="dv-card" aria-label="Recorded outcome">
            <p className="dv-card-title">{OUTCOME_LABELS[order.outcome.outcome]} · {timeOf(order.outcome.recordedAt)}</p>
            <p className="dv-item-sub">
              {order.outcome.deliveredUnits} of {order.loadedUnits} units handed over
              {order.outcome.issueKind ? ` · ${ISSUE_LABELS[order.outcome.issueKind]}` : ''}
              {order.outcome.recipientName ? ` · received by ${order.outcome.recipientName}` : ''}
            </p>
            <Link to={`/driver/deliveries/${order.orderId}`} className="dv-btn dv-btn-outline">View delivery record</Link>
          </section>
        ) : atStop ? (
          <div className="dv-btn-pair">
            <button type="button" className="dv-btn dv-btn-danger-outline" onClick={() => navigate(`${base}/orders/${orderId}/issue`)}>
              <AlertTriangle size={18} aria-hidden="true" />Report Issue
            </button>
            <button type="button" className="dv-btn dv-btn-primary" onClick={() => navigate(`${base}/orders/${orderId}/confirm`)}>
              <Check size={18} aria-hidden="true" />Delivered
            </button>
          </div>
        ) : (
          <div className="dv-info" role="status">Mark your arrival at {stop.outletId} before recording this order. <Link to={stopPath}>Open the stop</Link></div>
        )}
      </div>
    </div>
  )
}
