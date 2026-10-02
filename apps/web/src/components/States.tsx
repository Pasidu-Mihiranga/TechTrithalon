import type { ReactNode } from 'react'
import { Button } from './Button'

interface StateProps { title: string; description?: ReactNode; action?: ReactNode }

function StateBox({ title, description, action, tone }: StateProps & { tone: 'neutral' | 'danger' }) {
  return (
    <div className={`state state-${tone}`}>
      <h2 className="text-heading-s">{title}</h2>
      {description ? <p className="text-body-m state-text">{description}</p> : null}
      {action}
    </div>
  )
}

/** Nothing to show. Say what is missing and, where useful, which phase delivers it. Never fill with sample data. */
export function EmptyState(props: StateProps) { return <div role="status"><StateBox {...props} tone="neutral" /></div> }

interface ErrorStateProps { error?: unknown; title?: string; message?: string; traceId?: string | null; onRetry?: () => void }

/** A request failed. Shows the trace id so the failure can be matched to a server log line. */
export function ErrorState({ error, title = 'Something went wrong', message = 'The request could not be completed.', traceId, onRetry }: ErrorStateProps) {
  if (error && typeof error === 'object' && 'status' in error && error.status === 403) return <ForbiddenState />
  return (
    <div role="alert">
      <StateBox
        tone="danger"
        title={title}
        description={<>{message}{traceId ? <span className="state-trace"> Trace id: <code>{traceId}</code></span> : null}</>}
        action={onRetry ? <Button variant="secondary" onClick={onRetry}>Try again</Button> : undefined}
      />
    </div>
  )
}

/** The signed-in role is not allowed to see this. */
export function ForbiddenState({ description = 'Your role does not have access to this page.', action }: { description?: ReactNode; action?: ReactNode }) {
  return <div role="alert"><StateBox tone="neutral" title="Access denied" description={description} action={action} /></div>
}

/** Skeleton placeholder while data loads. Purely visual; announces a busy region. */
export function LoadingState({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton-group" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" />)}
    </div>
  )
}
