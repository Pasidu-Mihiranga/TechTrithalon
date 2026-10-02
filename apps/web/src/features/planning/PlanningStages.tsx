import { Button, PageHeader } from '../../components'
import { UnavailablePanel } from '../../components/UnavailablePanel'

const stages = ['Confirmed Orders', 'Generate Plan', 'Review Allocation', 'Resolve Exceptions', 'Confirm & Send']

export function PlanningStageTabs({ stage, onChange }: { stage: number; onChange: (stage: number) => void }) {
  return <nav className="planning-stages" aria-label="Planning stages">{stages.map((title, index) =>
    <Button key={title} variant={stage === index ? 'primary' : 'secondary'} aria-current={stage === index ? 'step' : undefined} onClick={() => onChange(index)}>{title}</Button>
  )}</nav>
}

/** Layouts are available before the later business services; never imply a run is executing. */
export function PlanningPendingStage({ stage }: { stage: number }) {
  return <>
    <PageHeader title={stages[stage]} subtitle="This planning stage needs capabilities from a later phase." />
    {stage === 1 && <div className="split-view">
      <div className="panel-stack">
        <UnavailablePanel title="Generate delivery plan" description="The independent validator and automatic planner arrive in Phases 6–9." />
        <UnavailablePanel title="Planning options and progress" description="No planning run is executing. Options and stage progress require the planner." />
      </div>
      <UnavailablePanel title="Planning summary" description="Estimated routes and execution time cannot be shown until a planning run exists." />
    </div>}
    {stage === 2 && <div className="split-view">
      <UnavailablePanel title="Vehicle allocation" description="Phase 7 supplies candidate trips, assignments and validated utilisation." />
      <UnavailablePanel title="Route review" description="A candidate route is required before its stops, map or alternative vehicles can be shown." />
    </div>}
    {stage === 3 && <div className="split-view">
      <UnavailablePanel title="Exceptions triage" description="Phase 10 supplies constraint evidence, suggested fixes and deferral actions." />
      <UnavailablePanel title="Impact of applying fixes" description="Changes must be simulated and validated before their impact can be displayed." />
    </div>}
    {stage === 4 && <div className="split-view">
      <UnavailablePanel title="Vehicle manifests" description="Phase 11 supplies validated publication and versioned vehicle manifests." />
      <UnavailablePanel title="Notify and send" description="A validated plan must be published before it can be sent to the loader." />
    </div>}
  </>
}
