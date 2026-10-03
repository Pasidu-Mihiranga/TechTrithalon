import { Link, useParams } from 'react-router-dom'
import { Badge, Button, Card, ErrorState, LoadingState, PageHeader } from '../../components'
import { deliveryBadge } from './StoreDeliveriesPage'
import { clock, KIND_LABELS, OUTCOME_LABELS, useConfirmReceipt, useStoreDelivery, when } from './receiptQueries'
import './receipt.css'

const DOCK: Record<string, string> = { street: 'Curbside, street unloading', rear_dock: 'Rear dock', mall_bay: 'Mall delivery bay' }

/** Figma Store Manager · Confirm Receipt (352:7457) and Receipt confirmed (532:10421): check what arrived against the driver's record. */
export function ConfirmReceiptPage() {
  const orderId = Number(useParams().orderId)
  const delivery = useStoreDelivery(orderId)
  const confirm = useConfirmReceipt(orderId)
  if (delivery.isPending) return <LoadingState rows={4} label="Loading the delivery" />
  if (delivery.isError) return <ErrorState error={delivery.error} message="The delivery could not be loaded." onRetry={() => void delivery.refetch()} />
  const d = delivery.data
  const row = d.row
  const badge = deliveryBadge(row)
  const delivered = row.phase === 'DELIVERED' && row.outcome !== null
  const shortBy = delivered && row.deliveredUnits !== null ? row.units - row.deliveredUnits : 0
  return (
    <>
      <PageHeader title={delivered && row.receipt === 'NONE' && row.outcome !== 'FAILED' ? 'Confirm receipt' : 'Delivery'}
        subtitle={`${row.orderRef} ${row.tempRequirement === 'chilled' ? 'chilled' : 'ambient'} · ${d.outletId} · ${d.district}`}
        actions={<Link className="btn btn-secondary btn-md" to="/store/deliveries">Back to deliveries</Link>} />

      {row.receipt === 'CONFIRMED' && (
        <div className="rc-banner rc-banner-good" role="status">Receipt confirmed. Thank you — the order is complete.</div>
      )}
      {row.receipt === 'DISPUTED' && (
        <div className="rc-banner rc-banner-warn" role="status">You reported an issue. Your dispatcher has been notified and will review it. <Link to="/store/issues">Track it under Issues</Link></div>
      )}
      {row.receipt === 'RESOLVED' && d.discrepancy && (
        <div className="rc-banner rc-banner-good" role="status">Issue resolved by the dispatcher: {d.discrepancy.decision?.replace('_', ' ').toLowerCase()} — {d.discrepancy.decisionNote}</div>
      )}

      <Card>
        <div className="rc-row">
          <h2 className="text-heading-s">Proof of delivery from the driver</h2>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
        {!delivered ? (
          <p className="rc-sub" role="status">
            {row.phase === 'IN_DELIVERY' ? 'Your order is out for delivery.' : 'Your order is planned and has not left the depot yet.'}
            {row.plannedArrival ? ` Planned arrival ${clock(row.plannedArrival)}.` : ''}
            {row.driverName ? ` Driver ${row.driverName}${row.vehicleId ? ` · ${row.vehicleId}` : ''}.` : ''}
          </p>
        ) : (
          <div className="rc-proof">
            <dl className="rc-facts">
              <div><dt>Delivered by</dt><dd>{row.driverName ?? '—'}{row.vehicleId ? ` · ${row.vehicleId}` : ''}</dd></div>
              <div><dt>Delivered at</dt><dd>{when(row.deliveredAt)}{row.windowOpen ? ` (window ${clock(row.windowOpen)}–${clock(row.windowClose)})` : ''}</dd></div>
              <div><dt>Recipient</dt><dd>{d.recipientName ?? '—'}</dd></div>
              <div><dt>Access</dt><dd>{DOCK[d.dockType] ?? d.dockType}</dd></div>
              {d.issueKind && <div><dt>Driver's note</dt><dd>{KIND_LABELS[d.issueKind] ?? d.issueKind.replace(/_/g, ' ').toLowerCase()}</dd></div>}
            </dl>
            <div className="rc-chips">
              <span className={`rc-chip${d.photos > 0 ? ' rc-chip-on' : ''}`}>{d.photos > 0 ? 'Photo captured' : 'No photo'}</span>
              <span className={`rc-chip${d.signatures > 0 ? ' rc-chip-on' : ''}`}>{d.signatures > 0 ? 'Signature captured' : 'No signature'}</span>
            </div>
          </div>
        )}
      </Card>

      {delivered && (
        <Card>
          <h2 className="text-heading-s">Check what arrived</h2>
          <p className="rc-sub">Compare the delivery with the driver's record. Flag anything that does not match.</p>
          <table className="rc-table" aria-label="Order lines">
            <thead><tr><th>Order</th><th>Ordered</th><th>Loaded</th><th>Delivered</th><th>Status</th></tr></thead>
            <tbody>
              <tr>
                <td><strong>{row.orderRef}</strong> <span className="rc-sub">{row.tempRequirement === 'chilled' ? 'chilled' : 'ambient'}</span></td>
                <td>{row.units}</td>
                <td>{d.loadedUnits}</td>
                <td>{row.deliveredUnits}</td>
                <td>
                  {row.outcome === 'FAILED' ? <Badge tone="danger">Not delivered</Badge>
                    : shortBy > 0 ? <Badge tone="warning">Short by {shortBy} · flagged by the driver</Badge>
                    : <Badge tone="success">Matches</Badge>}
                </td>
              </tr>
            </tbody>
          </table>
          {d.receiptRecord?.outcome === 'DISPUTED' && (
            <p className="rc-sub" role="status">You reported {KIND_LABELS[d.receiptRecord.kind ?? ''] ?? d.receiptRecord.kind}: {d.receiptRecord.affectedUnits} of {d.receiptRecord.deliveredUnits} units{d.receiptRecord.note ? ` — ${d.receiptRecord.note}` : ''}.</p>
          )}
          {d.canConfirm && (
            <div className="rc-actions">
              <Button loading={confirm.isPending} onClick={() => confirm.mutate()}>Confirm receipt</Button>
              <Link className="btn btn-secondary btn-md" to={`/store/deliveries/${orderId}/issue`}>Report an issue</Link>
            </div>
          )}
          {confirm.isError && <p className="rc-error" role="alert">{confirm.error.message}</p>}
          {!d.canConfirm && d.blocker && d.receiptRecord === null && <p className="rc-sub" role="status">{d.blocker}</p>}
        </Card>
      )}

      <Card>
        <h2 className="text-heading-s">Status timeline</h2>
        <ol className="rc-timeline" aria-label="Delivery timeline">
          {d.timeline.map(event => <li key={event.label}><strong>{event.label}</strong><span>{when(event.at)}</span></li>)}
        </ol>
        {OUTCOME_LABELS[row.outcome ?? ''] && <p className="rc-sub">Driver outcome: {OUTCOME_LABELS[row.outcome ?? '']}</p>}
      </Card>
    </>
  )
}
