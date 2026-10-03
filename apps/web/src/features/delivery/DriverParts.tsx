import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { ErrorState, LoadingState } from '../../components'
import { DriverRequestError, useOnline } from './driverQueries'
import type { DriverTripCard } from './driverQueries'

/** Online / offline pill (Figma "Net Status"). Writes need a connection until offline sync lands. */
export function NetPill() {
  const online = useOnline()
  return <span className={`dv-net ${online ? 'dv-net-online' : 'dv-net-offline'}`} role="status">{online ? 'Online' : 'Offline'}</span>
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

export function OfflineNotice() {
  const online = useOnline()
  if (online) return null
  return <div className="dv-info dv-info-warn" role="status">You are offline. Recording needs a connection; saving on the phone and syncing later comes with offline mode.</div>
}

export function Loading({ label }: { label: string }) {
  return <div className="dv-body"><LoadingState rows={4} label={label} /></div>
}

export function Failure({ error, message, onRetry, back }: { error: unknown; message: string; onRetry?: () => void; back?: string }) {
  const notFound = error instanceof DriverRequestError && error.status === 404
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
