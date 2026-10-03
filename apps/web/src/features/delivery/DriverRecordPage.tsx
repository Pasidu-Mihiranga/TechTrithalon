import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Camera, Check, ChevronRight, PenLine } from 'lucide-react'
import { ActionError, DriverHeader, Failure, Loading, NetPill, OfflineNotice } from './DriverParts'
import { findOrder } from './DriverOrderPage'
import { compressPhoto, ISSUE_LABELS, timeOf, useDriverAction, useDriverCapabilities, useDriverTrip, useUploadProof } from './driverQueries'
import type { DriverOrder, DriverStop, DriverTripDetail, IssueKind, OutcomeBody } from './driverQueries'
import './driver.css'

type Outcome = OutcomeBody['outcome']
type Proof = { id: number; kind: 'PHOTO' | 'SIGNATURE'; preview: string }
const ISSUE_ORDER: IssueKind[] = ['CUSTOMER_UNAVAILABLE', 'MISSING', 'DAMAGED', 'WRONG_ITEM', 'REFUSED', 'OTHER']
/** Nothing was handed over for these: the whole order fails. */
const WHOLE_ORDER: IssueKind[] = ['CUSTOMER_UNAVAILABLE', 'REFUSED']

/**
 * Figma Driver · Delivery Confirmation (58:5464) and Report Issue (59:5378) with their proof-photo and
 * signature states (835:20475, 835:20586) and Issue Recorded (59:5434). Outcomes use chips, never free
 * text for the reason (design rule: the driver is stopped, not typing).
 */
export function DriverRecordPage({ mode }: { mode: 'confirm' | 'issue' }) {
  const params = useParams()
  const tripIndex = Number(params.tripIndex)
  const orderId = Number(params.orderId)
  const trip = useDriverTrip(tripIndex)
  if (trip.isPending) return <Loading label="Loading the order" />
  if (trip.isError) return <Failure error={trip.error} back="/driver" message="The order could not be loaded." onRetry={() => void trip.refetch()} />
  const found = findOrder(trip.data, orderId)
  if (!found) return <Failure error={{ status: 404 }} back={`/driver/trips/${tripIndex}`} message="This order is not on the trip." />
  return <RecordForm key={`${mode}-${orderId}`} mode={mode} detail={trip.data} stop={found.stop} order={found.order} />
}

function RecordForm({ mode, detail, stop, order }: { mode: 'confirm' | 'issue'; detail: DriverTripDetail; stop: DriverStop; order: DriverOrder }) {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const tripIndex = detail.card.tripIndex
  const base = `/driver/trips/${tripIndex}`
  const capabilities = useDriverCapabilities()
  const action = useDriverAction(tripIndex, detail.version)
  const proofsEnabled = capabilities.data?.proofUploads === true
  const initial = (search.get('outcome') as Outcome | null) ?? 'DELIVERED'
  const [outcome, setOutcome] = useState<Outcome>(mode === 'issue' ? 'PARTIAL' : initial)
  const [issueKind, setIssueKind] = useState<IssueKind | null>(null)
  const [affected, setAffected] = useState(1)
  const [recipient, setRecipient] = useState('')
  const [notes, setNotes] = useState('')
  const [proofs, setProofs] = useState<Proof[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [recordedAt, setRecordedAt] = useState<string | null>(null)
  const loaded = order.loadedUnits
  // Any edit clears the earlier validation message.
  function edit<T>(setter: (value: T) => void) { return (value: T) => { setProblem(null); setter(value) } }

  // In issue mode the outcome follows from the reason and the units affected.
  const effectiveOutcome: Outcome = mode === 'issue'
    ? (issueKind && WHOLE_ORDER.includes(issueKind)) || affected >= loaded ? 'FAILED' : 'PARTIAL'
    : outcome
  const handedOver = effectiveOutcome !== 'FAILED'
  const delivered = effectiveOutcome === 'DELIVERED' ? loaded : effectiveOutcome === 'FAILED' ? 0 : loaded - affected
  const nextOrder = stop.orders.find(o => !o.outcome && o.orderId !== order.orderId)
  const after = nextOrder ? `${base}/orders/${nextOrder.orderId}` : `${base}/stops/${stop.seq}`

  if (order.outcome && !recordedAt) {
    return <Failure error={{ status: 409 }} back={`${base}/orders/${order.orderId}`} message="This order's outcome is already recorded." />
  }
  if (recordedAt && mode === 'issue') {
    return (
      <div className="dv-page">
        <div className="dv-done">
          <span className="dv-done-icon dv-done-bad"><AlertTriangle size={40} aria-hidden="true" /></span>
          <h1 className="dv-done-title">Issue recorded</h1>
          <p className="dv-done-sub">The dispatcher can see it now, with the store's receipt to follow.</p>
        </div>
        <div className="dv-body dv-body-tight">
          <section className="dv-kv" aria-label="Recorded issue">
            <div className="dv-kv-row"><span>Order ID</span><strong className="dv-mono">{order.orderRef}</strong></div>
            <div className="dv-kv-row"><span>Issue type</span><strong>{issueKind ? ISSUE_LABELS[issueKind] : ''}</strong></div>
            <div className="dv-kv-row"><span>Delivered</span><strong>{delivered} of {loaded} units</strong></div>
            <div className="dv-kv-row"><span>Time</span><strong>{timeOf(recordedAt)}</strong></div>
          </section>
          <button type="button" className="dv-btn dv-btn-primary" onClick={() => navigate(after)}>Continue</button>
        </div>
      </div>
    )
  }

  function submit() {
    setProblem(null)
    if (effectiveOutcome !== 'DELIVERED' && !issueKind) { setProblem('Choose what went wrong.'); return }
    if (handedOver && !recipient.trim()) { setProblem('Enter who received the order.'); return }
    if (handedOver && proofsEnabled && proofs.length === 0) { setProblem('Add a photo or the recipient’s signature.'); return }
    if (effectiveOutcome === 'PARTIAL' && (delivered < 1 || delivered >= loaded)) { setProblem(`Delivered units must be between 1 and ${loaded - 1}.`); return }
    const body: OutcomeBody = {
      outcome: effectiveOutcome,
      ...(effectiveOutcome === 'PARTIAL' ? { deliveredUnits: delivered } : {}),
      ...(effectiveOutcome !== 'DELIVERED' && issueKind ? { issueKind } : {}),
      ...(handedOver ? { recipientName: recipient.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      proofIds: proofs.map(p => p.id),
    }
    action.mutate({ kind: 'outcome', orderId: order.orderId, body }, {
      onSuccess: (result) => {
        const saved = findOrder(result, order.orderId)?.order.outcome
        if (mode === 'issue') setRecordedAt(saved?.recordedAt ?? new Date().toISOString())
        else navigate(after)
      },
    })
  }

  const title = mode === 'issue' ? 'Report Delivery Issue' : order.orderRef
  return (
    <div className="dv-page">
      <DriverHeader back={`${base}/orders/${order.orderId}`} title={title}
        sub={mode === 'issue' ? `${order.orderRef} · ${stop.outletId} · ${stop.district}` : `${stop.outletId} · ${stop.district}`}>
        <NetPill />
      </DriverHeader>
      <div className="dv-body dv-body-tight">
        <OfflineNotice />
        {mode === 'confirm' ? (
          <fieldset className="dv-field dv-fieldset">
            <legend className="dv-overline">Delivery outcome</legend>
            <div className="dv-choices">
              {(['DELIVERED', 'PARTIAL', 'FAILED'] as Outcome[]).map(value => (
                <button key={value} type="button" role="radio" aria-checked={outcome === value}
                  className={`dv-choice${outcome === value ? (value === 'DELIVERED' ? ' dv-choice-good' : ' dv-choice-bad') : ''}`}
                  onClick={() => edit(setOutcome)(value)}>
                  <span className="dv-radio">{outcome === value && value === 'DELIVERED' ? <Check size={14} aria-hidden="true" /> : null}</span>
                  {value === 'DELIVERED' ? 'Delivered' : value === 'PARTIAL' ? 'Partially delivered' : 'Failed delivery'}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {mode === 'issue' || outcome !== 'DELIVERED' ? (
          <fieldset className="dv-field dv-fieldset">
            <legend className="dv-overline">Issue type</legend>
            <div className="dv-choices">
              {ISSUE_ORDER.filter(kind => mode === 'issue' || outcome === 'FAILED' || !WHOLE_ORDER.includes(kind)).map(kind => (
                <button key={kind} type="button" role="radio" aria-checked={issueKind === kind}
                  className={`dv-choice${issueKind === kind ? ' dv-choice-bad' : ''}`} onClick={() => edit(setIssueKind)(kind)}>
                  <span className="dv-radio" />{ISSUE_LABELS[kind]}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {(mode === 'issue' && !(issueKind && WHOLE_ORDER.includes(issueKind))) || (mode === 'confirm' && outcome === 'PARTIAL') ? (
          <div className="dv-field">
            <span className="dv-overline" id="affected-label">Units affected</span>
            <div className="dv-stepper" role="group" aria-labelledby="affected-label">
              <button type="button" aria-label="Fewer units" onClick={() => edit(setAffected)(Math.max(1, affected - 1))}>−</button>
              <output aria-live="polite">{affected} of {loaded} {loaded === 1 ? 'unit' : 'units'}</output>
              <button type="button" aria-label="More units" onClick={() => edit(setAffected)(Math.min(mode === 'issue' ? loaded : loaded - 1, affected + 1))}>+</button>
            </div>
            <p className="dv-meta">{effectiveOutcome === 'FAILED' ? 'Nothing is handed over: the order is recorded as failed.' : `${delivered} ${delivered === 1 ? 'unit is' : 'units are'} handed over.`}</p>
          </div>
        ) : null}

        {handedOver ? (
          <ProofCapture tripIndex={tripIndex} orderId={order.orderId} enabled={proofsEnabled} loading={capabilities.isPending} proofs={proofs} onChange={edit(setProofs)} />
        ) : null}

        {handedOver ? (
          <div className="dv-field">
            <label className="dv-overline" htmlFor="recipient">Recipient name</label>
            <input id="recipient" className="dv-input" value={recipient} maxLength={120} autoComplete="off" onChange={e => edit(setRecipient)(e.target.value)} />
          </div>
        ) : null}
        <div className="dv-field">
          <label className="dv-overline" htmlFor="notes">Notes (optional)</label>
          <textarea id="notes" className="dv-input" value={notes} maxLength={500} placeholder="Add any remarks…" onChange={e => setNotes(e.target.value)} />
        </div>
        {problem ? <p className="dv-error" role="alert">{problem}</p> : null}
        <ActionError error={action.error} />
        <button type="button" className={`dv-btn ${mode === 'issue' ? 'dv-btn-danger' : 'dv-btn-primary'}`} disabled={action.isPending} onClick={submit}>
          {action.isPending ? 'Saving…' : mode === 'issue' ? 'Submit Issue' : effectiveOutcome === 'DELIVERED' ? 'Confirm Delivery' : 'Record Outcome'}
        </button>
      </div>
    </div>
  )
}

/** Photo (camera, compressed on the phone) and signature (drawn) proofs, uploaded as soon as they are captured. */
function ProofCapture({ tripIndex, orderId, enabled, loading, proofs, onChange }: {
  tripIndex: number; orderId: number; enabled: boolean; loading: boolean; proofs: Proof[]; onChange: (next: Proof[]) => void
}) {
  const upload = useUploadProof(tripIndex, orderId)
  const [signing, setSigning] = useState(false)
  const photo = proofs.find(p => p.kind === 'PHOTO')
  const signature = proofs.find(p => p.kind === 'SIGNATURE')

  async function store(kind: 'PHOTO' | 'SIGNATURE', file: Blob) {
    const blob = kind === 'PHOTO' ? await compressPhoto(file) : file
    upload.mutate({ kind, file: blob }, {
      onSuccess: (saved) => onChange([...proofs.filter(p => p.kind !== kind), { id: saved.id, kind, preview: URL.createObjectURL(blob) }]),
    })
  }

  if (loading) return null
  if (!enabled) {
    return <div className="dv-info" role="status">Proof photos are not set up on this server, so the delivery is recorded with the recipient's name only.</div>
  }
  return (
    <div className="dv-field">
      <span className="dv-overline">Proof of delivery</span>
      <div className="dv-proofs">
        <label className={`dv-proof${photo ? ' dv-proof-done' : ''}`}>
          {photo ? <img src={photo.preview} alt="Proof photo" className="dv-proof-thumb" /> : <span className="dv-proof-icon"><Camera size={24} aria-hidden="true" /></span>}
          <span>{photo ? 'Photo added' : 'Take photo'}</span>
          {photo ? <span className="dv-link">Retake</span> : null}
          <input type="file" accept="image/jpeg,image/png" capture="environment" aria-label={photo ? 'Retake proof photo' : 'Take proof photo'}
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void store('PHOTO', file); event.target.value = '' }} />
        </label>
        <div className={`dv-proof${signature ? ' dv-proof-done' : ''}`}>
          {signature ? <img src={signature.preview} alt="Recipient signature" className="dv-proof-thumb" /> : <span className="dv-proof-icon"><PenLine size={24} aria-hidden="true" /></span>}
          <span>{signature ? 'Signature captured' : 'Signature'}</span>
          {signature
            ? <button type="button" className="dv-link" onClick={() => onChange(proofs.filter(p => p.kind !== 'SIGNATURE'))}>Clear</button>
            : <button type="button" className="dv-link" onClick={() => setSigning(true)}>Capture <ChevronRight size={12} aria-hidden="true" /></button>}
        </div>
      </div>
      {upload.isPending ? <p className="dv-meta" role="status">Uploading…</p> : null}
      <ActionError error={upload.error} />
      {signing ? <SignatureDialog onCancel={() => setSigning(false)} onUse={(blob) => { setSigning(false); void store('SIGNATURE', blob) }} /> : null}
    </div>
  )
}

function SignatureDialog({ onUse, onCancel }: { onUse: (blob: Blob) => void; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const ratio = window.devicePixelRatio || 1
    element.width = element.clientWidth * ratio
    element.height = element.clientHeight * ratio
    const context = element.getContext('2d')
    if (!context) return
    context.scale(ratio, ratio)
    context.lineWidth = 2.5
    context.lineCap = 'round'
    context.strokeStyle = getComputedStyle(element).color
  }, [])

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  return (
    <div className="dv-overlay" role="dialog" aria-modal="true" aria-labelledby="sign-title">
      <div className="dv-dialog">
        <h2 id="sign-title">Recipient signature</h2>
        <p>Ask the recipient to sign inside the box.</p>
        <canvas ref={canvas} className="dv-sign-pad" aria-label="Signature pad"
          onPointerDown={(event) => {
            drawing.current = true
            event.currentTarget.setPointerCapture(event.pointerId)
            const context = event.currentTarget.getContext('2d'); const p = point(event)
            context?.beginPath(); context?.moveTo(p.x, p.y)
          }}
          onPointerMove={(event) => {
            if (!drawing.current) return
            const context = event.currentTarget.getContext('2d'); const p = point(event)
            context?.lineTo(p.x, p.y); context?.stroke(); setDrawn(true)
          }}
          onPointerUp={() => { drawing.current = false }} />
        <button type="button" className="dv-dialog-option" disabled={!drawn}
          onClick={() => canvas.current?.toBlob(blob => { if (blob) onUse(blob) }, 'image/png')}>Use signature</button>
        <button type="button" className="dv-dialog-option" onClick={onCancel}>Back to confirmation</button>
      </div>
    </div>
  )
}
