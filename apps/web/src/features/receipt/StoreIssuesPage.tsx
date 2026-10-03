import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader } from '../../components'
import { stamp, DECISION_LABELS, KIND_LABELS, useStoreIssues } from './receiptQueries'
import type { Discrepancy } from './receiptQueries'
import './receipt.css'

type Tab = 'ALL' | 'OPEN' | 'RESOLVED'

function title(issue: Discrepancy) {
  return `${KIND_LABELS[issue.kind] ?? issue.kind}: ${issue.affectedUnits} of ${issue.deliveredUnits} ${issue.deliveredUnits === 1 ? 'unit' : 'units'}`
}

/** Figma Store Manager · Issues (89:7890): the outlet's reported delivery issues and where each one stands. */
export function StoreIssuesPage() {
  const issues = useStoreIssues()
  const [tab, setTab] = useState<Tab>('ALL')
  const [selected, setSelected] = useState<number | null>(null)
  const all = issues.data ?? []
  const open = all.filter(i => i.status === 'OPEN')
  const resolved = all.filter(i => i.status === 'RESOLVED')
  const shown = tab === 'OPEN' ? open : tab === 'RESOLVED' ? resolved : all
  const current = all.find(i => i.id === selected) ?? shown[0]
  return (
    <>
      <PageHeader title="Issues" subtitle="Delivery issues you reported, and what the dispatcher decided."
        actions={<Link className="btn btn-primary btn-md" to="/store/deliveries">Report an issue</Link>} />
      <div className="rc-filters" role="tablist" aria-label="Issue status">
        {([['ALL', `All (${all.length})`], ['OPEN', `Open (${open.length})`], ['RESOLVED', `Resolved (${resolved.length})`]] as [Tab, string][]).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`filter-pill${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {issues.isPending && <LoadingState rows={3} label="Loading issues" />}
      {issues.isError && <ErrorState error={issues.error} message="Issues could not be loaded." onRetry={() => void issues.refetch()} />}
      {issues.data && all.length === 0 && <EmptyState title="No issues reported" description="When a delivery does not match, report it from Deliveries." />}
      {issues.data && all.length > 0 && (
        <div className="rc-split">
          <div className="rc-list" aria-label="Issues">
            {shown.length === 0 && <EmptyState title="Nothing here" description="No issues in this status." />}
            {shown.map(issue => (
              <button key={issue.id} type="button" className={`rc-card rc-issue${current?.id === issue.id ? ' rc-issue-active' : ''}`} onClick={() => setSelected(issue.id)}>
                <div className="rc-row">
                  <span className="rc-ref rc-mono">{issue.orderRef}</span>
                  <Badge tone={issue.status === 'OPEN' ? 'danger' : 'success'}>{issue.status === 'OPEN' ? 'Open' : 'Resolved'}</Badge>
                </div>
                <p className="rc-issue-title">{title(issue)}</p>
                <p className="rc-sub">{stamp(issue.reportedAt)}</p>
              </button>
            ))}
          </div>
          {current && (
            <aside className="rc-card rc-detail" aria-label="Issue detail">
              <div className="rc-row"><h2 className="rc-ref">{current.orderRef}</h2><Badge tone={current.status === 'OPEN' ? 'danger' : 'success'}>{current.status === 'OPEN' ? 'Open' : 'Resolved'}</Badge></div>
              <p className="rc-bad">{title(current)}</p>
              {current.note && <p className="rc-sub">{current.note}</p>}
              <dl className="rc-facts">
                <div><dt>Order</dt><dd>{current.orderRef}</dd></div>
                <div><dt>Reported</dt><dd>{stamp(current.reportedAt)}</dd></div>
                <div><dt>Reported by</dt><dd>{current.reportedByName}</dd></div>
                <div><dt>Status owner</dt><dd>Dispatcher</dd></div>
                {current.decision && <div><dt>Decision</dt><dd>{DECISION_LABELS[current.decision] ?? current.decision}</dd></div>}
              </dl>
              <div className={`rc-next${current.status === 'RESOLVED' ? ' rc-next-good' : ''}`}>
                <strong>{current.status === 'OPEN' ? 'WHAT HAPPENS NEXT' : 'RESOLVED'}</strong>
                <p>{current.status === 'OPEN' ? 'Your dispatcher has been notified and will review this issue. You can track its status here.'
                  : `${current.resolvedByName ?? 'The dispatcher'}: ${current.decisionNote}`}</p>
              </div>
              <Link className="rc-link" to={`/store/deliveries/${current.orderId}`}>View delivery →</Link>
            </aside>
          )}
        </div>
      )}
    </>
  )
}
