import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, DataTable, EmptyState, ErrorState, LoadingState, PageHeader, type Column, type SortState } from '../../components'
import { formatVolume, statusTone, tempLabel } from './orderDisplay'
import { useStoreOrders } from './orderQueries'

type OrderRow = NonNullable<NonNullable<ReturnType<typeof useStoreOrders>['data']>['items']>[number]

export function StoreOrdersPage() {
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<SortState>({ key: 'orderDate', direction: 'desc' })
  const orders = useStoreOrders({ page, sort: sort.key, asc: sort.direction === 'asc' })
  const columns = useMemo<Column<OrderRow>[]>(() => [
    {
      key: 'ref', header: 'Order ID', sortable: true,
      cell: (row) => <Link className="table-link" to={`/store/orders/${row.id}`}>{row.ref}</Link>,
    },
    { key: 'orderDate', header: 'Delivery date', sortable: true, cell: (row) => row.orderDate ?? '—' },
    { key: 'tempRequirement', header: 'Type', cell: (row) => tempLabel(row.tempRequirement ?? 'ambient') },
    { key: 'volumeM3', header: 'Volume', align: 'end', sortable: true, cell: (row) => formatVolume(row.volumeM3 ?? 0) },
    { key: 'status', header: 'Status', sortable: true, cell: (row) => <Badge tone={statusTone(row.status ?? '')}>{row.status}</Badge> },
  ], [])

  return (
    <>
      <PageHeader
        title="My orders"
        subtitle="Orders from your outlet."
        actions={<Link className="btn btn-primary btn-md" to="/store/orders/new">Place order</Link>}
      />
      {orders.isPending && <LoadingState rows={3} label="Loading orders" />}
      {orders.isError && <ErrorState error={orders.error} message="Orders could not be loaded." onRetry={() => void orders.refetch()} />}
      {orders.data && (orders.data.items?.length ?? 0) === 0 && (
        <EmptyState title="No orders" description="Your outlet has no orders for this view yet." />
      )}
      {orders.data && (orders.data.items?.length ?? 0) > 0 && (
        <>
        <DataTable
          caption="My orders"
          columns={columns}
          rows={orders.data.items ?? []}
          rowKey={(row) => String(row.id)}
          sort={sort}
          onSortChange={(next) => { setSort(next); setPage(0) }}
        />
        <nav className="toolbar-row" aria-label="Order pages">
          <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous page</Button>
          <span>Page {page + 1}</span>
          <Button variant="secondary" disabled={((orders.data.page ?? 0) + 1) * (orders.data.size ?? 50) >= (orders.data.total ?? 0)} onClick={() => setPage(page + 1)}>Next page</Button>
        </nav>
        </>
      )}
    </>
  )
}
