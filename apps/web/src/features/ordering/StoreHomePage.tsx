import { Link } from 'react-router-dom'
import { Card, EmptyState, ErrorState, LoadingState, MetricCard, PageHeader } from '../../components'
import { formatCutoffCountdown } from './orderDisplay'
import { StoreDeferralNotices } from './StoreDeferralNotices'
import { useStoreCutoff, useStoreOrders } from './orderQueries'

export function StoreHomePage() {
  const cutoff = useStoreCutoff()
  const orders = useStoreOrders({ size: 5 })

  return (
    <>
      <PageHeader title="Home" subtitle="Cutoff and recent orders for your outlet." />
      {cutoff.isPending && <LoadingState rows={1} label="Loading cutoff" />}
      {cutoff.isError && <ErrorState error={cutoff.error} message="Cutoff could not be loaded." onRetry={() => void cutoff.refetch()} />}
      {cutoff.data && (
        <section aria-label="Cutoff" className="grid-metrics">
          <MetricCard
            label={cutoff.data.open ? 'Next cutoff' : 'Cutoff closed'}
            value={formatCutoffCountdown(cutoff.data.secondsRemaining ?? 0)}
            caption={`16:00 Asia/Colombo · next delivery ${cutoff.data.nextDeliveryDate ?? '—'}`}
          />
          <MetricCard
            label="Ordering window"
            value={cutoff.data.open ? 'Open' : 'Closed'}
            caption={cutoff.data.open ? 'Place orders before 16:00' : 'Orders roll to the next cutoff'}
          />
        </section>
      )}
      <StoreDeferralNotices />
      <Card>
        <div className="card-header-row">
          <h2 className="text-heading-s">Recent orders</h2>
          <Link className="btn btn-secondary btn-md" to="/store/orders">View all</Link>
        </div>
        {orders.isPending && <LoadingState rows={2} label="Loading orders" />}
        {orders.isError && <ErrorState error={orders.error} message="Orders could not be loaded." onRetry={() => void orders.refetch()} />}
        {orders.data && (orders.data.items?.length ?? 0) === 0 && (
          <EmptyState title="No orders yet" description="Confirmed orders for your outlet will appear here." />
        )}
        {orders.data && (orders.data.items?.length ?? 0) > 0 && (
          <ul className="attention-list">
            {orders.data.items?.map((order) => (
              <li key={order.id}>
                <Link className="table-link" to={`/store/orders/${order.id}`}>{order.ref}</Link>
                {' · '}{order.status} · {order.orderDate}{order.planningDate !== order.orderDate ? ` · moved to ${order.planningDate} run` : ''}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Link className="btn btn-primary btn-md" to="/store/orders/new">Place an order</Link>
    </>
  )
}
