import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../../components'
import { SHORTFALL_LABELS, useLoaderIssues } from './loaderQueries'
import type { LoadingIssue } from './loaderQueries'
import './loading.css'

type Tab = 'all' | 'open' | 'resolved'

function ago(instant: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
    .format(new Date(instant))
}

const DECISIONS: Record<string, string> = { SEND_SHORT: 'Send short', REPLANNED: 'Replanned' }

/** Figma Loader · Issues (94:7720), open (789:13121), resolved (789:13302) and vehicle hold (801:15378). */
export function LoaderIssuesPage() {
  const issues = useLoaderIssues()
  const [tab, setTab] = useState<Tab>('open')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  if (issues.isPending) return <LoadingState rows={4} label="Loading reported issues" />
  if (issues.isError) return <ErrorState error={issues.error} message="Reported issues could not be loaded." onRetry={() => void issues.refetch()} />
  const all = issues.data
  const open = all.filter(i => i.status === 'OPEN')
  const resolved = all.filter(i => i.status === 'RESOLVED')
  const shown = tab === 'open' ? open : tab === 'resolved' ? resolved : all
  const selected = shown.find(i => i.id === selectedId) ?? shown[0] ?? null
  const held = open.filter(i => i.holdsVehicle)

  return (
    <div className="ld-page">
      <div className="ld-head">
        <div className="ld-head-text">
          <h1 className="ld-title">Issues</h1>
          <p className="ld-sub">{held.length > 0 ? `${[...new Set(held.map(i => i.vehicleId))].join(', ')} held · dispatch decision pending` : 'Shortfalls reported before departure'}</p>
        </div>
        <Link to="/loader" className="ld-btn ld-btn-primary ld-btn-s">Report from a trip</Link>
      </div>

      <div className="ld-kpis">
        <div className="ld-kpi"><strong>{all.length}</strong><span>Total reported</span><small>On this planning run</small></div>
        <div className="ld-kpi"><strong className={open.length ? 'ld-stat-bad' : undefined}>{open.length}</strong><span>Needs attention</span><small>Dispatcher reviewing</small></div>
        <div className="ld-kpi"><strong className="ld-stat-good">{resolved.length}</strong><span>Resolved</span><small>Dispatcher decided</small></div>
      </div>

      <div className="ld-tabs" role="tablist" aria-label="Filter issues">
        {([['all', `All (${all.length})`], ['open', `Open (${open.length})`], ['resolved', `Resolved (${resolved.length})`]] as const).map(([key, label]) => (
          <button key={key} type="button" role="tab" className="ld-tab" aria-selected={tab === key} onClick={() => { setTab(key); setSelectedId(null) }}>{label}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState title={tab === 'open' ? 'No open issues' : 'No issues'} description="Shortfalls you report from an order appear here with the dispatcher's decision." />
      ) : (
        <div className="ld-grid">
          <section className="ld-card" aria-label="Reported issues">
            <div className="ld-list-head"><p className="ld-overline">Reported issues</p><span className="ld-list-meta">Newest first</span></div>
            {shown.map(issue => (
              <button key={issue.id} type="button" className="ld-issue" aria-current={selected?.id === issue.id} onClick={() => setSelectedId(issue.id)}>
                <span className={`ld-accent ${issue.status === 'OPEN' ? (issue.holdsVehicle ? 'ld-accent-danger' : 'ld-accent-update') : 'ld-accent-loaded'}`} />
                <div className="ld-grow">
                  <p className="ld-stop-title">{issue.orderRef} <span className="ld-list-meta">· {issue.vehicleId}</span></p>
                  <p className="ld-stop-sub">{SHORTFALL_LABELS[issue.kind]}: {issue.shortUnits} of {issue.orderedUnits} units short at {issue.outletId}</p>
                </div>
                <div className="ld-metric"><IssueBadge issue={issue} /><small>{ago(issue.reportedAt)}</small></div>
              </button>
            ))}
          </section>
          {selected && <IssueDetail issue={selected} />}
        </div>
      )}
    </div>
  )
}

function IssueBadge({ issue }: { issue: LoadingIssue }) {
  if (issue.status === 'RESOLVED') return <span className="ld-badge ld-badge-loaded">{DECISIONS[issue.decision ?? ''] ?? 'Resolved'}</span>
  return <span className={`ld-badge ${issue.holdsVehicle ? 'ld-badge-held' : 'ld-badge-loading'}`}>{issue.holdsVehicle ? 'Vehicle held' : 'Sent short'}</span>
}

function IssueDetail({ issue }: { issue: LoadingIssue }) {
  const resolved = issue.status === 'RESOLVED'
  const available = issue.orderedUnits - issue.shortUnits
  return (
    <aside className="ld-side">
      <section className="ld-card ld-card-pad" aria-label="Selected issue">
        <div className="ld-row"><p className="ld-overline ld-grow">Selected issue</p><span className="ld-list-meta">{issue.orderRef}</span></div>
        <IssueBadge issue={issue} />
        <p className="ld-card-title">{resolved ? `Decided: ${DECISIONS[issue.decision ?? ''] ?? issue.decision}` : issue.holdsVehicle ? 'Vehicle held' : 'Sent short'}</p>
        <p className="ld-card-sub">{SHORTFALL_LABELS[issue.kind]}: {issue.shortUnits} of {issue.orderedUnits} units for {issue.outletId}.{issue.note ? ` “${issue.note}”` : ''}</p>
        <div>
          <div className="ld-kv">Order <strong>{issue.orderRef}</strong></div>
          <div className="ld-kv">Vehicle <strong>{issue.vehicleId} · trip {issue.tripIndex}</strong></div>
          <div className="ld-kv">Reported <strong>{ago(issue.reportedAt)} · {issue.reportedByName}</strong></div>
          <div className="ld-kv">Owner <strong>{resolved ? issue.resolvedByName : 'Dispatcher'}</strong></div>
        </div>
      </section>
      {!resolved && issue.holdsVehicle && (
        <div className="ld-note"><p className="ld-overline">Keep the vehicle at the dock</p>
          <p>The dispatcher has been notified. Hold {issue.vehicleId} until it is released.</p></div>
      )}
      {resolved && issue.decisionNote && (
        <div className="ld-note"><p className="ld-overline">Dispatcher note</p><p>{issue.decisionNote}</p></div>
      )}
      <section className="ld-card" aria-label="Progress">
        <div className="ld-list-head"><p className="ld-overline">Progress</p><span className="ld-list-meta">{issue.orderRef}</span></div>
        <ol className="ld-steps">
          <li><span className="ld-step-n ld-step-good">1</span><div><p className="ld-stop-title">{available} of {issue.orderedUnits} units available</p><p className="ld-stop-sub">Count recorded before departure</p></div></li>
          <li><span className={`ld-step-n ${resolved ? 'ld-step-good' : 'ld-step-warn'}`}>2</span><div><p className="ld-stop-title">Dispatcher {resolved ? 'decided' : 'informed'}</p>
            <p className="ld-stop-sub">{resolved ? `${DECISIONS[issue.decision ?? ''] ?? issue.decision} · ${issue.resolvedAt ? ago(issue.resolvedAt) : ''}` : 'Awaiting review'}</p></div></li>
          <li><span className={`ld-step-n ${resolved ? 'ld-step-good' : issue.holdsVehicle ? 'ld-step-bad' : 'ld-step-warn'}`}>3</span><div>
            <p className="ld-stop-title">{resolved ? 'Vehicle may be handed over' : issue.holdsVehicle ? 'Wait for the release instruction' : 'Continue loading'}</p>
            <p className="ld-stop-sub">{resolved ? 'Mark the trip loaded once every order is counted' : issue.holdsVehicle ? 'Do not hand over until dispatch releases the vehicle' : 'The trip can leave with the available units'}</p></div></li>
        </ol>
      </section>
    </aside>
  )
}
