import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, MapPin, Search } from 'lucide-react'
import { EmptyState } from '../../components'
import { DriverHeader, Failure, Loading, NetPill } from './DriverParts'
import { clock, dayOf, num, plural, timeOf, useDriverDeliveries, usePastTrips } from './driverQueries'
import type { DriverDeliveryRow } from './driverQueries'
import './driver.css'

const FILTERS = [
  { key: 'ALL', label: 'All' }, { key: 'DELIVERED', label: 'Delivered' }, { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'PENDING', label: 'Pending' }, { key: 'ISSUE', label: 'Issues' },
] as const
const STATUS: Record<string, { label: string; tone: string; accent: string }> = {
  DELIVERED: { label: 'Delivered', tone: 'good', accent: 'good' },
  ISSUE: { label: 'Issue', tone: 'bad', accent: 'bad' },
  IN_PROGRESS: { label: 'In Progress', tone: 'brand', accent: 'brand' },
  PENDING: { label: 'Pending', tone: 'muted', accent: '' },
}

/** Figma Driver · Deliveries (61:5417) and Past Trips (195:1029). */
export function DriverDeliveriesPage() {
  const [tab, setTab] = useState<'today' | 'past'>('today')
  return (
    <div className="dv-page">
      <DriverHeader title="Deliveries"><NetPill /></DriverHeader>
      <div className="dv-body dv-body-tight">
        <div className="dv-seg dv-seg-inline" role="tablist" aria-label="Deliveries">
          <button type="button" role="tab" aria-selected={tab === 'today'} className={`dv-seg-item${tab === 'today' ? ' dv-seg-item-active' : ''}`} onClick={() => setTab('today')}>Today</button>
          <button type="button" role="tab" aria-selected={tab === 'past'} className={`dv-seg-item${tab === 'past' ? ' dv-seg-item-active' : ''}`} onClick={() => setTab('past')}>Past Trips</button>
        </div>
        {tab === 'today' ? <Today /> : <Past />}
      </div>
    </div>
  )
}

function Today() {
  const deliveries = useDriverDeliveries()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('ALL')
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (deliveries.data?.rows ?? []).filter(row => (filter === 'ALL' || row.status === filter)
      && (!q || row.outletId.toLowerCase().includes(q) || row.district.toLowerCase().includes(q) || row.orderRefs.some(ref => ref.toLowerCase().includes(q))))
  }, [deliveries.data, query, filter])
  if (deliveries.isPending) return <Loading label="Loading today's deliveries" />
  if (deliveries.isError) return <Failure error={deliveries.error} message="Today's deliveries could not be loaded." onRetry={() => void deliveries.refetch()} />
  const total = deliveries.data.rows.length
  return (
    <>
      <label className="dv-search"><Search size={18} aria-hidden="true" />
        <input type="search" placeholder="Search order or outlet" aria-label="Search order or outlet" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="dv-filters" role="group" aria-label="Filter by status">
        {FILTERS.map(f => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} className={`dv-filter${filter === f.key ? ' dv-filter-active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>
      <p className="dv-overline">Today's deliveries · {plural(total, 'stop')}</p>
      {total === 0 ? <EmptyState title="No deliveries today" description="Stops appear here once a plan with your vehicle is published." />
        : rows.length === 0 ? <EmptyState title="No matching stops" description="Change the search or the filter." />
        : <div className="dv-list">{rows.map(row => <Row key={`${row.tripIndex}-${row.seq}`} row={row} />)}</div>}
    </>
  )
}

function Row({ row }: { row: DriverDeliveryRow }) {
  const status = STATUS[row.status] ?? STATUS.PENDING
  return (
    <Link to={`/driver/trips/${row.tripIndex}/stops/${row.seq}`} className="dv-item">
      <span className={`dv-accent${status.accent ? ` dv-accent-${status.accent}` : ''}`} />
      <span className={`dv-icon-tile${row.status === 'DELIVERED' ? ' dv-icon-tile-good' : row.status === 'IN_PROGRESS' ? ' dv-icon-tile-brand' : ''}`}><MapPin size={20} aria-hidden="true" /></span>
      <div className="dv-grow">
        <p className="dv-item-title">{row.outletId}</p>
        <p className="dv-item-sub">Trip {row.tripIndex} · {row.district}</p>
        <p className="dv-item-sub">{plural(row.orders, 'order')} · {num(row.weightKg)} kg</p>
      </div>
      <div className="dv-right">
        <span className={`dv-pill dv-pill-${status.tone}`}>{status.label}</span>
        <span className="dv-meta">{row.completedAt ? timeOf(row.completedAt) : `ETA ${clock(row.eta)}`}</span>
      </div>
      <ChevronRight size={18} className="dv-chevron" aria-hidden="true" />
    </Link>
  )
}

function Past() {
  const past = usePastTrips(true)
  if (past.isPending) return <Loading label="Loading past trips" />
  if (past.isError) return <Failure error={past.error} message="Past trips could not be loaded." onRetry={() => void past.refetch()} />
  if (past.data.length === 0) return <EmptyState title="No past trips yet" description="Trips you ran on earlier days appear here." />
  return (
    <div className="dv-list">
      {past.data.map(trip => (
        <div key={`${trip.planDate}-${trip.tripIndex}`} className="dv-item">
          <span className={`dv-accent ${trip.failed + trip.partial > 0 ? 'dv-accent-bad' : 'dv-accent-good'}`} />
          <div className="dv-grow">
            <p className="dv-item-title">Trip {trip.tripIndex} · {dayOf(trip.planDate)}</p>
            <p className="dv-item-sub">{trip.vehicleId}{trip.brand ? ` · ${trip.brand}` : ''}{trip.district ? ` · ${trip.district}` : ''}</p>
            <p className="dv-item-sub">{plural(trip.stops, 'stop')} · {trip.delivered} delivered{trip.partial ? ` · ${trip.partial} partial` : ''}{trip.failed ? ` · ${trip.failed} failed` : ''}</p>
          </div>
          <span className={`dv-pill dv-pill-${trip.completedAt ? 'good' : 'warn'}`}>{trip.completedAt ? 'Completed' : 'Not finished'}</span>
        </div>
      ))}
    </div>
  )
}
