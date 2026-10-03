import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, CircleAlert, CircleCheck } from 'lucide-react'
import { ErrorState, LoadingState } from '../../components'
import { DriverRequestError, OfflineError, useOnline } from './driverQueries'
import { useFieldSync } from '../offline/useFieldSync'
import type { DriverTripCard } from './driverQueries'

/**
 * Connection and outbox state (Figma "Net Status"): Online, Offline · N saved, Syncing d/t, or a review
 * badge. It opens the Sync Status screen.
 */
export function NetPill() {
  const online = useOnline()
  const { status } = useFieldSync()
  let label = 'Online'
  let tone = 'online'
  if (!online || status.blocked === 'offline') { label = status.pending > 0 ? `Offline · ${status.pending}` : 'Offline'; tone = 'offline' }
  else if (status.syncing) { label = `Syncing ${status.done}/${status.total}`; tone = 'syncing' }
  else if (status.needsReview > 0) { label = `Review · ${status.needsReview}`; tone = 'review' }
  else if (status.pending > 0) { label = `Saved · ${status.pending}`; tone = 'offline' }
  return <Link to="/driver/sync" className={`dv-net dv-net-${tone}`} aria-label={`Sync status: ${label}`}>{label}</Link>
}

/** Light page header (Figma 112 px header minus the device status bar): back, title, subtitle, pills. */
export function DriverHeader({ back, title, sub, children }: { back?: string; title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="dv-header">
      {back ? <Link to={back} className="dv-back" aria-label="Back"><ChevronLeft size={20} aria-hidden="true" /></Link> : null}
      <div className="dv-header-text">
        <h1 className="dv-header-title">{title}</h1>
        {sub ? <p className="dv-header-sub">{sub}</p> : null}
      </div>
      {children}
    </header>
  )
}

/** Figma offline banner: what happens to the driver's records while there is no connection. */
export function OfflineNotice({ fromCache = false }: { fromCache?: boolean }) {
  const online = useOnline()
  const { status } = useFieldSync()
  if (status.blocked === 'signed-out')
    return <div className="dv-info dv-info-bad" role="status"><CircleAlert size={16} aria-hidden="true" />Sign in again to sync {status.pending} saved {status.pending === 1 ? 'action' : 'actions'}.</div>
  if (!online || status.blocked === 'offline')
    return <div className="dv-info dv-info-warn" role="status"><CircleCheck size={16} aria-hidden="true" />Offline — saved on this phone, will sync automatically</div>
  if (fromCache) return <div className="dv-info dv-info-warn" role="status">Showing the last copy saved on this phone.</div>
  return null
}

export function Loading({ label }: { label: string }) {
  return <div className="dv-body"><LoadingState rows={4} label={label} /></div>
}

export function Failure({ error, message, onRetry, back }: { error: unknown; message: string; onRetry?: () => void; back?: string }) {
  const notFound = error instanceof DriverRequestError && error.status === 404
  if (error instanceof OfflineError) {
    return (
      <div className="dv-page">
        <DriverHeader back={back} title="Offline" />
        <div className="dv-body"><ErrorState title="Not saved on this phone yet" message="Open this screen once while online; after that it works without a connection." onRetry={onRetry} /></div>
      </div>
    )
  }
  return (
    <div className="dv-page">
      <DriverHeader back={back} title={notFound ? 'Not found' : 'Something went wrong'} />
      <div className="dv-body">
        <ErrorState error={error} title={notFound ? 'Not one of your trips' : undefined}
          message={notFound ? 'This trip or order is not assigned to you today.' : message} onRetry={notFound ? undefined : onRetry}
          traceId={error instanceof DriverRequestError ? error.traceId : undefined} />
      </div>
    </div>
  )
}

/** The action error under a button: the server's message and code, never a raw stack. */
export function ActionError({ error }: { error: unknown }) {
  if (!error) return null
  const message = error instanceof Error ? error.message : 'The action failed. Try again.'
  return <p className="dv-error" role="alert">{message}</p>
}

export function tripState(card: Pick<DriverTripCard, 'state'>): { label: string; tone: 'brand' | 'muted' | 'good' } {
  switch (card.state) {
    case 'READY': return { label: 'Ready for Departure', tone: 'brand' }
    case 'IN_PROGRESS': return { label: 'In Progress', tone: 'brand' }
    case 'COMPLETED': return { label: 'Completed', tone: 'good' }
    default: return { label: 'Loading at depot', tone: 'muted' }
  }
}

export function routeLabel(card: Pick<DriverTripCard, 'depot' | 'district'>) {
  return `${card.depot} → ${card.district}`
}
