import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, Input, LoadingState, PageHeader, Select, TypeBadge, type Column, type SortState } from '../../components'
import { formatVolume, planningLabel, planningTone, statusTone, tempKind, tempLabel } from './orderDisplay'
import { useDispatcherOrders } from './orderQueries'
import { useDispatcherScope } from '../shell/useDispatcherScope'

type OrderRow = NonNullable<NonNullable<ReturnType<typeof useDispatcherOrders>['data']>['items']>[number]

export function DispatcherOrdersPage({
  title = 'Orders',
  subtitle = 'Confirmed orders for the planning day.',
  selectable = false,
  selectedKeys,
  onSelectedKeysChange,
  statusFilter = 'confirmed',
  date,
  depot,
}: {
  title?: string
  subtitle?: string
  selectable?: boolean
  selectedKeys?: Set<string>
  onSelectedKeysChange?: (next: Set<string>) => void
  statusFilter?: string
  date?: string
  depot?: string
} = {}) {
  const [page, setPage] = useState(0)
  const scope = useDispatcherScope()
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  function setQ(value: string) {
    setSearchParams((previous) => { previous.set('q', value); return previous }, { replace: true })
  }
  const [brand, setBrand] = useState('')
  const [tempRequirement, setTemp] = useState('')
  const [status, setStatus] = useState(statusFilter)
  const [sort, setSort] = useState<SortState>({ key: 'ref', direction: 'asc' })
  const orders = useDispatcherOrders({
    date, depot: depot || scope.depot, page,
    q: q || undefined,
    brand: brand || undefined,
    tempRequirement: tempRequirement || undefined,
    status: selectable ? 'confirmed' : status || undefined,
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
          <Input label="Search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder="Search order, outlet, district" />
          <Select label="Brand" value={brand} onChange={(e) => { setBrand(e.target.value); setPage(0) }} options={[
            { value: '', label: 'All brands' },
            { value: 'Fresh', label: 'Fresh' },
            { value: 'Style', label: 'Style' },
            { value: 'Tech', label: 'Tech' },
          ]} />
          <Select label="Type" value={tempRequirement} onChange={(e) => { setTemp(e.target.value); setPage(0) }} options={[
            { value: '', label: 'All types' },
            { value: 'ambient', label: 'Ambient' },
            { value: 'chilled', label: 'Refrigerated' },
          ]} />
          {!selectable && <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0) }} options={[
            { value: '', label: 'All statuses' },
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'deferred', label: 'Deferred' },
            { value: 'planned', label: 'Planned' },
          ]} />}
        </div>
      </Card>
      {orders.isPending && <LoadingState rows={4} label="Loading orders" />}
      {orders.isError && <ErrorState error={orders.error} message="Orders could not be loaded." onRetry={() => void orders.refetch()} />}
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
            onSortChange={(next) => { setSort(next); setPage(0) }}
            selectedKeys={selectable ? selectedKeys : undefined}
            onSelectedKeysChange={selectable ? onSelectedKeysChange : undefined}
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
