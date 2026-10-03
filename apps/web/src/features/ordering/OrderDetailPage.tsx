import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Card, ErrorState, LoadingState, PageHeader, TypeBadge } from '../../components'
import { formatVolume, formatWeight, statusTone, tempKind, tempLabel } from './orderDisplay'
import { StoreDeferralNotices } from './StoreDeferralNotices'
import { useDispatcherOrder, useStoreOrder } from './orderQueries'

export function DispatcherOrderDetailPage() {
  const id = Number(useParams().id)
  const order = useDispatcherOrder(id)
  return <OrderDetailView order={order} backTo="/dispatcher/orders" backLabel="Back to orders" />
}

export function StoreOrderDetailPage() {
  const id = Number(useParams().id)
  const order = useStoreOrder(id)
  return <OrderDetailView order={order} backTo="/store/orders" backLabel="Back to my orders"
    notices={<StoreDeferralNotices orderId={id} />} />
}

function OrderDetailView({
  order,
  backTo,
  backLabel,
  notices,
}: {
  order: ReturnType<typeof useDispatcherOrder>
  backTo: string
  backLabel: string
  notices?: ReactNode
}) {
  return (
    <>
      <PageHeader
        title={order.data?.ref ?? 'Order'}
        subtitle={order.data ? `${order.data.outletId} · ${order.data.brand} · ${order.data.district}` : 'Order detail'}
        actions={<Link className="btn btn-secondary btn-md" to={backTo}>{backLabel}</Link>}
      />
      {order.isPending && <LoadingState rows={3} label="Loading order" />}
      {order.isError && <ErrorState error={order.error} message="Order could not be loaded." onRetry={() => void order.refetch()} />}
      {order.data && notices}
      {order.data && (
        <Card>
          <dl className="detail-grid">
            <div><dt>Status</dt><dd><Badge tone={statusTone(order.data.status ?? '')}>{order.data.status}</Badge></dd></div>
            <div><dt>Type</dt><dd><TypeBadge kind={tempKind(order.data.tempRequirement ?? 'ambient')}>{tempLabel(order.data.tempRequirement ?? 'ambient')}</TypeBadge></dd></div>
            <div><dt>Depot</dt><dd>{order.data.depot}</dd></div>
            <div><dt>Requested delivery</dt><dd>{order.data.orderDate}</dd></div>
            {order.data.planningDate && order.data.planningDate !== order.data.orderDate
              && <div><dt>Moved to planning run</dt><dd>{order.data.planningDate}</dd></div>}
            <div><dt>Units</dt><dd>{order.data.units}</dd></div>
            <div><dt>Weight</dt><dd>{formatWeight(order.data.weightKg ?? 0)}</dd></div>
            <div><dt>Volume</dt><dd>{formatVolume(order.data.volumeM3 ?? 0)}</dd></div>
            <div><dt>Confirmed</dt><dd>{order.data.confirmedAt ? new Date(order.data.confirmedAt).toLocaleString('en-LK', { timeZone: 'Asia/Colombo' }) : '—'}</dd></div>
          </dl>
          <section aria-label="Order timeline">
            <h2 className="text-heading-s">Status timeline</h2>
            <ol>
              {order.data.placedAt && <li>Placed · {new Date(order.data.placedAt).toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })}</li>}
              {order.data.confirmedAt && <li>Confirmed · {new Date(order.data.confirmedAt).toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })}</li>}
            </ol>
            {order.data.status !== 'confirmed' && <p>Current status: {order.data.status}. Later event timestamps are not available yet.</p>}
          </section>
        </Card>
      )}
    </>
  )
}
