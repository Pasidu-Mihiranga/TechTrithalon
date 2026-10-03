import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleAlert, CircleCheck, Clock, Info, RefreshCw } from 'lucide-react'
import { needsReview } from '@techtrithalon/field-core'
import type { OutboxEntry } from '@techtrithalon/field-core'
import { DriverHeader, NetPill } from '../delivery/DriverParts'
import { dayOf, timeOf, useOnline } from '../delivery/driverQueries'
import { useFieldSync } from './useFieldSync'
import '../delivery/driver.css'

const REVIEW_TEXT: Record<string, string> = {
  ORDER_NOT_ON_TRIP: 'the dispatcher moved this order while you were offline. Your delivery record was kept, and the dispatcher reviews it.',
  STOP_NOT_ON_TRIP: 'this stop was moved off your trip while you were offline. Your arrival was kept for the dispatcher to review.',
  ROUTE_CHANGED_OFFLINE: 'the dispatcher updated this trip while you were offline. Your start was kept; the remaining stops follow the new plan.',
  PROOF_MISSING: 'no proof file reached the server with this delivery. The record was kept and the dispatcher reviews it.',
}

function resultText(entry: OutboxEntry) {
  if (entry.review) return REVIEW_TEXT[entry.review] ?? 'the dispatcher reviews this record.'
  if (entry.result === 'CONFLICT') return `${entry.message ?? 'it disagrees with what the server already has.'} The server kept its record.`
  return entry.message ?? 'the server did not accept it.'
}

/**
 * Figma Driver · Offline Sync (62:5536) and Sync Reconciled (188:913): what is saved on the phone,
 * sync progress, the last sync, and the records the dispatcher reviews or the server did not accept.
 */
export function SyncStatusPage() {
  const navigate = useNavigate()
  const online = useOnline()
  const { engine, status } = useFieldSync()
  const [showSaved, setShowSaved] = useState(false)
  const history = engine?.history() ?? []
  const review = history.filter(needsReview)
  const offline = !online || status.blocked === 'offline'
  const settledThisRun = status.done
  const lastSynced = status.lastSyncedAt ? `Last synced ${dayOf(status.lastSyncedAt)}, ${timeOf(status.lastSyncedAt)}` : 'Not synced from this phone yet'

  return (
    <div className="dv-page">
      <DriverHeader back="/driver" title="Sync Status"><NetPill /></DriverHeader>
      <section className={`dv-sync-hero ${offline ? 'dv-sync-hero-offline' : 'dv-sync-hero-online'}`} aria-label="Connection">
        <span className="dv-sync-icon">{offline ? <Info size={28} aria-hidden="true" /> : <CircleCheck size={28} aria-hidden="true" />}</span>
        <h1 className="dv-done-title">{offline ? 'No connection' : status.syncing ? 'Back online' : status.pending > 0 ? 'Online' : 'All synced'}</h1>
        <p className="dv-done-sub">{offline ? 'Your delivery records are safe.' : status.syncing ? 'Syncing your delivery records now.'
          : status.pending > 0 ? 'Records are waiting to sync.' : 'Every record on this phone is on the server.'}</p>
      </section>
      <div className="dv-body dv-body-tight">
        <div className="dv-item">
          <span className="dv-icon-tile"><Clock size={20} aria-hidden="true" /></span>
          <div className="dv-grow">
            {status.syncing ? (
              <><p className="dv-item-title">{settledThisRun} of {status.total} records synced</p><p className="dv-item-sub">Finishing up…</p></>
            ) : (
              <><p className="dv-item-title">{status.pending} {status.pending === 1 ? 'action' : 'actions'} saved</p>
                <p className="dv-item-sub">{status.pending > 0 ? 'Waiting to sync' : 'Nothing waiting'}</p></>
            )}
          </div>
        </div>
        {status.blocked === 'signed-out' ? (
          <div className="dv-info dv-info-bad" role="status"><CircleAlert size={16} aria-hidden="true" />Your session ended. Sign in again; saved actions stay on this phone and sync then.</div>
        ) : offline ? (
          <div className="dv-info dv-info-cold"><Info size={16} aria-hidden="true" />Your records will sync automatically when connection returns.</div>
        ) : status.blocked === 'error' ? (
          <div className="dv-info dv-info-warn" role="status"><CircleAlert size={16} aria-hidden="true" />The server did not answer. Your records are kept; try again.</div>
        ) : null}
        {review.length > 0 ? (
          <section className="dv-review" aria-label="Records that need review">
            <strong><CircleAlert size={16} aria-hidden="true" />{review.length} {review.length === 1 ? 'record needs' : 'records need'} review</strong>
            {review.map(entry => (
              <p key={entry.seq} className="dv-review-item">{entry.label} — <span>{resultText(entry)}</span></p>
            ))}
          </section>
        ) : null}
        <p className="dv-meta dv-row"><CircleCheck size={14} aria-hidden="true" />{lastSynced}</p>
        {!offline && status.pending > 0 && !status.syncing ? (
          <button type="button" className="dv-btn dv-btn-outline" onClick={() => void engine?.sync()}><RefreshCw size={18} aria-hidden="true" />Sync now</button>
        ) : null}
        {review.length > 0 && !offline ? (
          <button type="button" className="dv-btn dv-btn-primary" onClick={() => { void engine?.acknowledge(); navigate('/driver') }}>Continue</button>
        ) : (
          <button type="button" className="dv-btn dv-btn-primary" aria-expanded={showSaved} onClick={() => setShowSaved(v => !v)}>
            {showSaved ? 'Hide Saved Records' : 'View Saved Records'}
          </button>
        )}
        {showSaved ? (
          <section className="dv-kv" aria-label="Saved records">
            {history.length === 0 ? <div className="dv-kv-row"><span>No records on this phone yet</span></div> : history.map(entry => (
              <div key={entry.seq} className="dv-kv-row">
                <span>{entry.label}</span>
                <strong className={entry.state === 'pending' ? 'dv-meta' : entry.result === 'APPLIED' || entry.result === 'DUPLICATE' ? 'dv-good-text' : 'dv-bad-text'}>
                  {entry.state === 'pending' ? 'Waiting' : entry.result === 'APPLIED' || entry.result === 'DUPLICATE' ? (entry.review ? 'Synced · review' : 'Synced')
                    : entry.result === 'CONFLICT' ? 'Conflict' : 'Not accepted'}
                </strong>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  )
}
