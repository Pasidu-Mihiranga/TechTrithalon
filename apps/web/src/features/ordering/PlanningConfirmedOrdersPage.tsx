import { EmptyState } from '../../components'
import { DispatcherOrdersPage } from './DispatcherOrdersPage'

/**
 * Planning Step 1 layout on live confirmed orders. Snapshot selection / generate plan
 * actions arrive in Phases 5–9; this page must not invent planning results.
 */
export function PlanningConfirmedOrdersPage() {
  return (
    <>
      <DispatcherOrdersPage
        title="Confirmed orders"
        subtitle="Step 1 · inspect the closed order set for the demo delivery day."
      />
      <EmptyState
        title="Planning actions not available yet"
        description="Order selection, snapshots and plan generation are delivered in Phases 5–9. The table above is live confirmed demand only."
      />
    </>
  )
}
