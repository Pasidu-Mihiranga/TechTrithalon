import { PageHeader } from '../../components'
import { UnavailablePanel } from '../../components/UnavailablePanel'

const stages = ['Confirmed Orders', 'Generate Plan', 'Review Allocation', 'Resolve Exceptions', 'Confirm & Send']

export function PlanningStageTabs({ stage, onChange }: { stage: number; onChange: (stage: number) => void }) {
  return (
    <nav className="planning-stepper-card" aria-label="Planning stages">
      <div className="planning-stepper">
        {stages.map((title, index) => {
          const isActive = stage === index
          const isDone = stage > index
          return (
            <button
              key={title}
              type="button"
              className={`stepper-step ${isActive ? 'stepper-step-active' : ''} ${isDone ? 'stepper-step-done' : ''}`}
              aria-current={isActive ? 'step' : undefined}
              onClick={() => onChange(index)}
            >
              <div
                className={`stepper-bar ${isActive || isDone ? 'stepper-bar-active' : ''}`}
                aria-hidden="true"
              />
              <div className="stepper-content">
                <span
                  className={`stepper-num ${isActive ? 'stepper-num-active' : ''} ${isDone ? 'stepper-num-done' : ''}`}
                >
                  {isDone ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </span>
                <span className={`stepper-title ${isActive || isDone ? 'stepper-title-active' : ''}`}>
                  {title}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </nav>
  )
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
