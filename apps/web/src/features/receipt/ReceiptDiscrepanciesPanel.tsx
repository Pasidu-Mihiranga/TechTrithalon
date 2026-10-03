import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState } from '../../components'
import { stamp, DECISION_LABELS, KIND_LABELS, useReceiptDiscrepancies, useResolveDiscrepancy, when } from './receiptQueries'
import type { Decision, Discrepancy } from './receiptQueries'
import './receipt.css'

const DECISIONS: Decision[] = ['CREDIT', 'REPLACEMENT', 'NO_ACTION']

/** Disputed deliveries from store managers, with the driver's record, for the dispatcher to decide. */
export function ReceiptDiscrepanciesPanel() {
  const depot = useOutletContext<{ depot?: string } | undefined>()?.depot
  const list = useReceiptDiscrepancies(depot)
  const open = (list.data ?? []).filter(d => d.status === 'OPEN')
  const resolved = (list.data ?? []).filter(d => d.status === 'RESOLVED')
  return (
    <section aria-label="Receipt discrepancies" className="rc-list">
      <Card>
        <h2 className="text-heading-s">Receipt discrepancies</h2>
        <p className="rc-sub">Deliveries a store manager disputed after the driver recorded them. Deciding one closes the order as received.</p>
        {list.isPending && <LoadingState rows={2} label="Loading receipt discrepancies" />}
        {list.isError && <ErrorState error={list.error} message="Receipt discrepancies could not be loaded." onRetry={() => void list.refetch()} />}
        {list.data && open.length === 0 && <EmptyState title="No open receipt discrepancies" description="Disputes from store managers appear here." />}
      </Card>
      {open.map(item => <DiscrepancyCard key={item.id} item={item} />)}
      {resolved.length > 0 && (
        <Card>
          <h3 className="text-heading-s">Resolved ({resolved.length})</h3>
          <ul className="attention-list">
            {resolved.map(item => (
              <li key={item.id}><strong>{item.orderRef}</strong> · {item.outletId} · {DECISION_LABELS[item.decision ?? ''] ?? item.decision} · {item.resolvedByName}, {stamp(item.resolvedAt ?? item.reportedAt)}</li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}

function DiscrepancyCard({ item }: { item: Discrepancy }) {
  const resolve = useResolveDiscrepancy()
  const [decision, setDecision] = useState<Decision | null>(null)
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  function submit() {
    setProblem(null)
    if (!decision) { setProblem('Choose a decision.'); return }
    if (!note.trim()) { setProblem('Write what you decided and why.'); return }
    resolve.mutate({ id: item.id, version: item.version, decision, note: note.trim() })
  }
  return (
    <article className="rc-card" aria-label={`Receipt discrepancy ${item.orderRef}`}>
      <div className="rc-row">
        <h3 className="rc-ref">{item.orderRef} · {item.outletId}</h3>
        <Badge tone="danger">{KIND_LABELS[item.kind] ?? item.kind}: {item.affectedUnits} of {item.deliveredUnits} units</Badge>
      </div>
      <p className="rc-sub">
        Reported by {item.reportedByName}, {when(item.reportedAt)}
        {item.vehicleId ? ` · delivered by ${item.driverName ?? 'the driver'} on ${item.vehicleId}` : ''}{item.deliveredAt ? ` at ${when(item.deliveredAt)}` : ''}
      </p>
      {item.note && <p className="rc-sub">“{item.note}”</p>}
      <fieldset className="rc-fieldset">
        <legend className="rc-legend">Decision</legend>
        <div className="rc-kinds">
          {DECISIONS.map(d => (
            <button key={d} type="button" role="radio" aria-checked={decision === d} className={`filter-pill${decision === d ? ' active' : ''}`}
              onClick={() => { setDecision(d); setProblem(null) }}>{DECISION_LABELS[d]}</button>
          ))}
        </div>
      </fieldset>
      <div className="rc-field">
        <label className="rc-legend" htmlFor={`note-${item.id}`}>Decision note for {item.orderRef}</label>
        <textarea id={`note-${item.id}`} className="rc-input" rows={2} maxLength={500} value={note} onChange={e => { setNote(e.target.value); setProblem(null) }} />
      </div>
      {problem && <p className="rc-error" role="alert">{problem}</p>}
      {resolve.isError && <p className="rc-error" role="alert">{resolve.error.message}</p>}
      <div className="rc-actions"><Button loading={resolve.isPending} onClick={submit}>Resolve</Button></div>
    </article>
  )
}
