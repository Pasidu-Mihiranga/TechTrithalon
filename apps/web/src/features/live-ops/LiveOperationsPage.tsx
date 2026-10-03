import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../../components'
import type { BadgeTone } from '../../components'
import { useDispatcherScope } from '../shell/useDispatcherScope'
import { useReferenceSummary } from '../shell/useReferenceSummary'
import { STATE_LABELS, STATE_ORDER, clock, lastUpdate, stamp, useLiveBoard } from './liveQueries'
import type { LiveBoard, LiveState, LiveVehicle } from './liveQueries'
import './liveOps.css'

type Filter = 'ALL' | 'ROAD' | 'WAITING' | 'COMPLETED'
const TONES: Record<LiveState, BadgeTone> = { LOADING: 'brand', READY: 'brand', IN_TRANSIT: 'success', DELAYED: 'warning', COMPLETED: 'neutral' }
const FILTERS: Record<Filter, (v: LiveVehicle) => boolean> = {
  ALL: () => true,
  ROAD: v => v.state === 'IN_TRANSIT' || v.state === 'DELAYED',
  WAITING: v => v.state === 'LOADING' || v.state === 'READY',
  COMPLETED: v => v.state === 'COMPLETED',
}
const key = (v: LiveVehicle) => `${v.vehicleId}#${v.tripIndex}`

/** Where every published trip stands, refreshed every 15 s (Figma Live Operations 76:5697). */
export function LiveOperationsPage() {
  const scope = useDispatcherScope()
  const summary = useReferenceSummary()
  const date = summary.data?.demoOperatingDate
  const board = useLiveBoard(date, scope.depot)
  const [filter, setFilter] = useState<Filter>('ALL')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const vehicles = [...(board.data?.vehicles ?? [])].sort((a, b) =>
    STATE_ORDER[a.state as LiveState] - STATE_ORDER[b.state as LiveState] || key(a).localeCompare(key(b)))
  const shown = vehicles.filter(FILTERS[filter])
  const selected = shown.find(v => key(v) === selectedKey) ?? shown[0] ?? null

  return <>
    <PageHeader title="Live Operations"
      subtitle={board.data ? `Real-time fleet monitoring · ${board.data.depot} Depot · ${board.data.date} · refreshes every 15 seconds` : 'Fleet progress, current stops and last updates.'} />
    {(summary.isPending || board.isPending) && !board.isError && <LoadingState rows={4} label="Loading live operations" />}
    {summary.isError && <ErrorState error={summary.error} message="The delivery day could not be loaded." onRetry={() => void summary.refetch()} />}
    {board.isError && <ErrorState error={board.error} message="The live board could not be loaded." onRetry={() => void board.refetch()} />}
    {board.data && (board.data.vehicles.length === 0
      ? <EmptyState title="No published trips for this run" description="Trips appear here once a plan is published for this date and depot." />
      : <>
        <div role="group" aria-label="Filter vehicles" className="lo-filters">
          {([['ALL', `All (${board.data.counts.total})`], ['ROAD', `On the road (${board.data.counts.inTransit + board.data.counts.delayed})`],
            ['WAITING', `At the depot (${board.data.counts.loading + board.data.counts.ready})`], ['COMPLETED', `Completed (${board.data.counts.completed})`]] as const).map(([k, label]) =>
            <button key={k} type="button" className={`filter-pill${filter === k ? ' active' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}
        </div>
        <div className="lo-split">
          <section aria-label="Active vehicles">
            <h2 className="text-heading-s lo-heading">Active vehicles <span className="lo-count">{shown.length}</span></h2>
            {shown.length === 0 && <EmptyState title="No vehicles in this view" description="Choose another filter." />}
            <ul className="lo-list">
              {shown.map(v => key(v) === (selected && key(selected))
                ? <li key={key(v)}><VehicleCard vehicle={v} /></li>
                : <li key={key(v)}><VehicleRow vehicle={v} onSelect={() => setSelectedKey(key(v))} /></li>)}
            </ul>
          </section>
          <RouteProgress board={board.data} selectedKey={selected ? key(selected) : null} onSelect={setSelectedKey} />
        </div>
      </>)}
  </>
}

function VehicleRow({ vehicle: v, onSelect }: { vehicle: LiveVehicle; onSelect: () => void }) {
  const state = v.state as LiveState
  return (
    <button type="button" className="lo-row" aria-label={`Show ${v.vehicleId} trip ${v.tripIndex}`} onClick={onSelect}>
      <span className="lo-row-top"><span className="lo-ref">{v.vehicleId}</span><Badge tone={TONES[state]}>{STATE_LABELS[state]}</Badge></span>
      <span className="lo-sub">{v.driverName ?? 'No driver'} · Trip {v.tripIndex} · {v.district}</span>
    </button>
  )
}

function VehicleCard({ vehicle: v }: { vehicle: LiveVehicle }) {
  const [details, setDetails] = useState(false)
  const state = v.state as LiveState
  const stop = v.currentStopSeq !== null ? `${v.currentOutletId} (${v.currentStopSeq} of ${v.stops})` : state === 'COMPLETED' ? 'All stops served' : 'Not left the depot'
  return (
    <Card>
      <article aria-label={`${v.vehicleId} trip ${v.tripIndex}`} className="lo-card">
        <div className="lo-row-top"><h3 className="lo-ref lo-ref-big">{v.vehicleId}</h3><Badge tone={TONES[state]}>{STATE_LABELS[state]}</Badge></div>
        <dl className="lo-facts">
          <div><dt>Driver</dt><dd>{v.driverName ?? 'Not assigned'}</dd></div>
          <div><dt>Current trip</dt><dd>Trip {v.tripIndex} · {v.district}</dd></div>
          <div><dt>Current stop</dt><dd>{stop}{v.currentStopState === 'EN_ROUTE' && v.currentEta ? <><br /><span className="field-hint">ETA {clock(v.currentEta)}</span></> : null}</dd></div>
          <div><dt>Progress</dt><dd>{v.ordersDone} / {v.orders} orders{v.issues > 0 ? <><br /><span className="field-hint">{v.issues} with issues</span></> : null}</dd></div>
          <div><dt>Last update</dt><dd title={stamp(v.lastUpdateAt)}>{lastUpdate(v.minutesAgo)}</dd></div>
        </dl>
        <Button variant="secondary" aria-expanded={details} onClick={() => setDetails(!details)}>View Trip Details <ArrowRight size={16} aria-hidden="true" /></Button>
        {details && (
          <ol className="lo-stops" aria-label="Trip stops">
            {v.stopMarks.map(s => (
              <li key={s.seq}>
                <span>{s.seq}. {s.outletId}</span>
                <Badge tone={s.status === 'COMPLETED' ? 'success' : s.late ? 'warning' : s.status === 'ARRIVED' ? 'brand' : 'neutral'}>
                  {s.status === 'COMPLETED' ? 'Done' : s.status === 'ARRIVED' ? 'At the stop' : s.late ? 'Running late' : 'Pending'}
                </Badge>
              </li>
            ))}
            {v.plannedDepart && <li className="field-hint">Planned departure {clock(v.plannedDepart)} · plan v{v.planVersion}</li>}
          </ol>
        )}
      </article>
    </Card>
  )
}

const X0 = 90
const X1 = 560
const ROW = 64

/** There are no map coordinates, so each trip is drawn as a spoke from the depot to its district with its stops. */
function RouteProgress({ board, selectedKey, onSelect }: { board: LiveBoard; selectedKey: string | null; onSelect: (key: string) => void }) {
  const vehicles = board.vehicles
  return (
    <section aria-label="Route progress" className="lo-map">
      <ul className="lo-legend" aria-label="Legend">
        {(['IN_TRANSIT', 'DELAYED', 'COMPLETED', 'LOADING'] as const).map(s => <li key={s}><span className={`lo-dot lo-dot-${s}`} />{s === 'LOADING' ? 'Loading / ready' : STATE_LABELS[s]}</li>)}
      </ul>
      <svg viewBox={`0 0 640 ${vehicles.length * ROW + 24}`} role="img" aria-label="Trips from the depot to their districts" className="lo-svg">
        {vehicles.map((v, i) => {
          const y = 44 + i * ROW
          const state = v.state as LiveState
          const n = v.stopMarks.length
          const at = (idx: number) => X0 + ((X1 - X0) * (idx + 1)) / (n + 1)
          const done = v.stopMarks.filter(s => s.status === 'COMPLETED').length
          const pos = [X0, ...v.stopMarks.map((_, idx) => at(idx))]
          const seq = v.currentStopSeq ?? 0
          const marker = state === 'COMPLETED' ? X1 : seq === 0 ? X0 : v.currentStopState === 'ARRIVED' ? pos[seq] : (pos[seq - 1] + pos[seq]) / 2
          return (
            <g key={key(v)} className={`lo-spoke lo-spoke-${state}${key(v) === selectedKey ? ' lo-spoke-selected' : ''}`} onClick={() => onSelect(key(v))}>
              <text x={X0 - 7} y={y - 20} className="lo-svg-label">{v.vehicleId} · T{v.tripIndex}</text>
              <line x1={X0} y1={y} x2={X1} y2={y} className="lo-line" />
              <line x1={X0} y1={y} x2={done === 0 && state !== 'COMPLETED' ? X0 : state === 'COMPLETED' ? X1 : at(done - 1)} y2={y} className="lo-line-done" />
              <circle cx={X0} cy={y} r={7} className="lo-depot" />
              {v.stopMarks.map((s, idx) => <circle key={s.seq} cx={at(idx)} cy={y} r={5} className={`lo-stop lo-stop-${s.status}${s.late ? ' lo-stop-late' : ''}`}><title>{`${s.outletId}: ${s.status.toLowerCase()}`}</title></circle>)}
              <circle cx={X1} cy={y} r={7} className="lo-district" />
              <text x={X1 + 12} y={y + 4} className="lo-svg-label">{v.district}</text>
              <polygon points={`${marker},${y - 14} ${marker - 8},${y - 2} ${marker + 8},${y - 2}`} className="lo-vehicle"><title>{`${v.vehicleId}: ${STATE_LABELS[state]}`}</title></polygon>
            </g>
          )
        })}
      </svg>
      <p className="field-hint">Schematic only: the data has no map coordinates. Last snapshot {stamp(board.asOf)}.</p>
    </section>
  )
}
