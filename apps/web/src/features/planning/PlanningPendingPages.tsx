import { PageHeader } from '../../components'
import { UnavailablePanel } from '../../components/UnavailablePanel'

export function DeferredOrdersPage() {
  return <>
    <PageHeader title="Deferred Orders" subtitle="Orders not assigned during planning and needing a decision." />
    <section className="grid-metrics" aria-label="Deferral summary">
      {['Deferred orders', 'No feasible vehicle', 'Can be assigned', 'Resolved'].map(title => <UnavailablePanel key={title} title={title} description="Deferral metrics become available with Phase 8." />)}
    </section>
    <div className="split-view">
      <UnavailablePanel title="Deferred order queue" description="Phase 8 supplies deferred orders, reasons and next-run protection." />
      <UnavailablePanel title="Deferral record and feasible options" description="Select an order once deferral records and validated options are available." />
    </div>
  </>
}

export function ExceptionsPage() {
  return <>
    <PageHeader title="Exceptions" subtitle="Issues requiring dispatcher attention." />
    <div className="split-view">
      <UnavailablePanel title="Open, in-progress and resolved issues" description="Phase 10 supplies planning exceptions and their resolution history." />
      <UnavailablePanel title="Issue detail and suggested fix" description="Validated fixes become available with the constraint and explanation services." />
    </div>
  </>
}
