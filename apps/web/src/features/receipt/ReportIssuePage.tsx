import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, ErrorState, LoadingState, PageHeader } from '../../components'
import { KIND_LABELS, useReportIssue, useStoreDelivery } from './receiptQueries'
import type { DisputeKind } from './receiptQueries'
import './receipt.css'

const KINDS: DisputeKind[] = ['SHORT', 'DAMAGED', 'WRONG_ITEM', 'OTHER']

/** Figma Store Manager · Report an issue (532:10602): a delivery discrepancy against the driver's record. */
export function ReportIssuePage() {
  const orderId = Number(useParams().orderId)
  const navigate = useNavigate()
  const delivery = useStoreDelivery(orderId)
  const report = useReportIssue(orderId)
  const [kind, setKind] = useState<DisputeKind | null>(null)
  const [units, setUnits] = useState(1)
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  if (delivery.isPending) return <LoadingState rows={3} label="Loading the delivery" />
  if (delivery.isError) return <ErrorState error={delivery.error} message="The delivery could not be loaded." onRetry={() => void delivery.refetch()} />
  const d = delivery.data
  const row = d.row
  const delivered = row.deliveredUnits ?? 0
  const back = `/store/deliveries/${orderId}`

  if (!d.canConfirm) {
    return (
      <>
        <PageHeader title="Report an issue" subtitle={`${row.orderRef} · ${d.outletId}`} />
        <Card><p role="status">{d.blocker ?? 'An issue cannot be reported for this order.'}</p><Link className="btn btn-secondary btn-md" to={back}>Back to the delivery</Link></Card>
      </>
    )
  }

  function submit() {
    setProblem(null)
    if (!kind) { setProblem('Choose what is wrong.'); return }
    if (units < 1 || units > delivered) { setProblem(`Units affected must be between 1 and ${delivered}.`); return }
    if (kind === 'OTHER' && !note.trim()) { setProblem('Describe what is wrong.'); return }
    report.mutate({ kind, affectedUnits: units, ...(note.trim() ? { note: note.trim() } : {}) }, { onSuccess: () => navigate('/store/issues') })
  }

  return (
    <>
      <PageHeader title="Report an issue" subtitle={`Delivery discrepancy · ${d.outletId} · ${d.district}`} />
      <Card>
        <h2 className="text-heading-s">Order: {row.orderRef}</h2>
        <p className="rc-sub">Delivered by the driver: {delivered} of {row.units} units{d.recipientName ? ` · received by ${d.recipientName}` : ''}</p>
        <fieldset className="rc-fieldset">
          <legend className="rc-legend">What is wrong?</legend>
          <div className="rc-kinds">
            {KINDS.map(k => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={`filter-pill${kind === k ? ' active' : ''}`}
                onClick={() => { setKind(k); setProblem(null) }}>{KIND_LABELS[k]}</button>
            ))}
          </div>
        </fieldset>
        <div className="rc-field">
          <label className="rc-legend" htmlFor="units">Units affected (of {delivered})</label>
          <input id="units" className="rc-input" type="number" min={1} max={delivered} value={units}
            onChange={e => { setUnits(Number(e.target.value)); setProblem(null) }} />
        </div>
        <div className="rc-field">
          <label className="rc-legend" htmlFor="note">Details{kind === 'OTHER' ? '' : ' (optional)'}</label>
          <textarea id="note" className="rc-input" rows={3} maxLength={500} value={note} onChange={e => { setNote(e.target.value); setProblem(null) }} />
        </div>
        {problem && <p className="rc-error" role="alert">{problem}</p>}
        {report.isError && <p className="rc-error" role="alert">{report.error.message}</p>}
        <div className="rc-actions">
          <Button loading={report.isPending} onClick={submit}>Submit issue</Button>
          <Link className="btn btn-secondary btn-md" to={back}>Cancel</Link>
        </div>
      </Card>
    </>
  )
}
