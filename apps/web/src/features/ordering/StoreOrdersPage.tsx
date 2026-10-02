import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, DataTable, EmptyState, ErrorState, LoadingState, PageHeader, type Column, type SortState } from '../../components'
import { formatVolume, statusTone, tempLabel } from './orderDisplay'
import { useStoreOrders } from './orderQueries'

type OrderRow = NonNullable<NonNullable<ReturnType<typeof useStoreOrders>['data']>['items']>[number]

export function StoreOrdersPage() {
  const [sort, setSort] = useState<SortState>({ key: 'orderDate', direction: 'desc' })
  const orders = useStoreOrders({ sort: sort.key, asc: sort.direction === 'asc' })
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
      {orders.isError && <ErrorState message="Orders could not be loaded." onRetry={() => void orders.refetch()} />}
      {orders.data && (orders.data.items?.length ?? 0) === 0 && (
        <EmptyState title="No orders" description="Your outlet has no orders for this view yet." />
      )}
      {orders.data && (orders.data.items?.length ?? 0) > 0 && (
        <DataTable
          caption="My orders"
          columns={columns}
          rows={orders.data.items ?? []}
          rowKey={(row) => String(row.id)}
          sort={sort}
          onSortChange={setSort}
        />
      )}
    </>
  )
}
