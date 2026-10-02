import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, DataTable, EmptyState, ErrorState, Input, LoadingState, PageHeader, Select, TypeBadge, type Column, type SortState } from '../../components'
import { formatVolume, planningLabel, planningTone, statusTone, tempKind, tempLabel } from './orderDisplay'
import { useDispatcherOrders } from './orderQueries'

type OrderRow = NonNullable<NonNullable<ReturnType<typeof useDispatcherOrders>['data']>['items']>[number]

export function DispatcherOrdersPage({
  title = 'Orders',
  subtitle = 'Confirmed orders for the planning day.',
}: {
  title?: string
  subtitle?: string
} = {}) {
  const [q, setQ] = useState('')
  const [brand, setBrand] = useState('')
  const [tempRequirement, setTemp] = useState('')
  const [status, setStatus] = useState('confirmed')
  const [sort, setSort] = useState<SortState>({ key: 'ref', direction: 'asc' })
  const orders = useDispatcherOrders({
    q: q || undefined,
    brand: brand || undefined,
    tempRequirement: tempRequirement || undefined,
    status: status || undefined,
    sort: sort.key,
    asc: sort.direction === 'asc',
  })

  const columns = useMemo<Column<OrderRow>[]>(() => [
    {
      key: 'ref', header: 'Order ID', sortable: true,
      cell: (row) => <Link className="table-link" to={`/dispatcher/orders/${row.id}`}>{row.ref}</Link>,
    },
    { key: 'outletId', header: 'Outlet', sortable: true, cell: (row) => `${row.outletId} · ${row.district ?? ''}` },
    {
      key: 'tempRequirement', header: 'Type', sortable: true,
      cell: (row) => <TypeBadge kind={tempKind(row.tempRequirement ?? 'ambient')}>{tempLabel(row.tempRequirement ?? 'ambient')}</TypeBadge>,
    },
    { key: 'volumeM3', header: 'Qty / load', sortable: true, align: 'end', cell: (row) => formatVolume(row.volumeM3 ?? 0) },
    { key: 'status', header: 'Status', sortable: true, cell: (row) => <Badge tone={statusTone(row.status ?? '')}>{row.status}</Badge> },
    { key: 'planning', header: 'Planning', cell: (row) => <Badge tone={planningTone(row.status ?? '')}>{planningLabel(row.status ?? '')}</Badge> },
  ], [])

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <Card className="toolbar-card">
        <div className="toolbar-row">
          <Input label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order, outlet, district" />
          <Select label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} options={[
            { value: '', label: 'All brands' },
            { value: 'Fresh', label: 'Fresh' },
            { value: 'Style', label: 'Style' },
            { value: 'Tech', label: 'Tech' },
          ]} />
          <Select label="Type" value={tempRequirement} onChange={(e) => setTemp(e.target.value)} options={[
            { value: '', label: 'All types' },
            { value: 'ambient', label: 'Ambient' },
            { value: 'chilled', label: 'Refrigerated' },
          ]} />
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={[
            { value: '', label: 'All statuses' },
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'deferred', label: 'Deferred' },
            { value: 'planned', label: 'Planned' },
          ]} />
        </div>
      </Card>
      {orders.isPending && <LoadingState rows={4} label="Loading orders" />}
      {orders.isError && <ErrorState message="Orders could not be loaded." onRetry={() => void orders.refetch()} />}
      {orders.data && (orders.data.items?.length ?? 0) === 0 && (
        <EmptyState title="No orders" description="No orders match these filters for the demo delivery day." />
      )}
      {orders.data && (orders.data.items?.length ?? 0) > 0 && (
        <>
          <p className="text-body-s text-secondary">{orders.data.total} orders</p>
          <DataTable
            caption="Confirmed orders"
            columns={columns}
            rows={orders.data.items ?? []}
            rowKey={(row) => String(row.id)}
            sort={sort}
            onSortChange={setSort}
          />
        </>
      )}
    </>
  )
}
