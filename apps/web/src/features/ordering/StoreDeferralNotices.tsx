import { Badge, Button, Card, ErrorState, LoadingState } from '../../components'
import { useAcknowledgeDeferral, useStoreDeferrals } from '../planning/deferralQueries'
import { deferReasonLabel } from '../planning/deferralReasons'

/**
 * Deferral notices for the store's outlet: reason, the run the order moved to and who decided.
 * No arrival time is promised for a run that has not been planned yet.
 */
export function StoreDeferralNotices({ orderId }: { orderId?: number }) {
  const notices = useStoreDeferrals()
  const acknowledge = useAcknowledgeDeferral()
  // Never let an unexpected payload take down the store's home page.
  const items = (Array.isArray(notices.data) ? notices.data : []).filter(notice => orderId == null || notice.orderId === orderId)
  if (notices.isPending) return <LoadingState rows={1} label="Loading deferral notices" />
  if (notices.isError) return <ErrorState error={notices.error} message="Deferral notices could not be loaded." onRetry={() => void notices.refetch()} />
  if (items.length === 0) return null
  return (
    <Card>
      <h2 className="text-heading-s">Deferral notice{items.length === 1 ? '' : 's'}</h2>
      <ul className="attention-list">
        {items.map(notice => (
          <li key={notice.id}>
            <p>
              <strong>{notice.orderRef}</strong> ({notice.tempRequirement}) was not planned for {notice.planDate}.{' '}
              {notice.protectNextRun ? <Badge tone="warning">Priority on next run</Badge> : null}
            </p>
            <p>Reason: {deferReasonLabel(notice.reasonCode)}. {notice.reason}</p>
            <p>It moves to the {notice.nextPlanningDate} planning run. The arrival time is confirmed only after that run is planned.</p>
            <p className="field-hint">Decided by {notice.decidedByName}.</p>
            {notice.acknowledgedAt
              ? <p className="field-hint">Acknowledged.</p>
              : <Button variant="secondary" loading={acknowledge.isPending && acknowledge.variables === notice.id}
                  onClick={() => acknowledge.mutate(notice.id)}>Acknowledge</Button>}
          </li>
        ))}
      </ul>
      {acknowledge.isError && <ErrorState error={acknowledge.error} message={acknowledge.error.message} />}
    </Card>
  )
}
