import { Link } from 'react-router-dom'
import { Card, PageHeader } from '../../components'
import { UnavailablePanel } from '../../components/UnavailablePanel'

export function CapacityForecastPage() {
  return <>
    <PageHeader title="Capacity forecast" subtitle="Demand against fleet capacity." actions={<Link className="btn btn-secondary btn-md" to="/dispatcher/capacity-decision">Capacity decision</Link>} />
    <section className="grid-metrics" aria-label="Forecast summary">
      {['Fleet capacity per day', 'Refrigerated capacity per day', 'Weeks over capacity', 'Peak chilled overshoot'].map(title => <UnavailablePanel key={title} title={title} description="Computed forecasts and capacity limits arrive in Phases 17 and 19." />)}
    </section>
    <div className="split-view">
      <UnavailablePanel title="Total volume per day" description="Phase 17 supplies observed and predicted demand with source and model version." />
      <UnavailablePanel title="Chilled volume per day" description="Fresh chilled demand needs the forecasting service before a chart can be shown." />
    </div>
    <div className="split-view">
      <UnavailablePanel title="Selected week" description="Weekly projections are not available yet." />
      <UnavailablePanel title="Recommended action" description="Phase 19 supplies computed gaps and options for dispatcher review." />
    </div>
  </>
}

export function CapacityDecisionPage() {
  return <>
    <PageHeader title="Capacity decision" subtitle="Review forecast capacity gaps before recording a fleet decision." />
    <UnavailablePanel title="Forecast snapshot" description="A forecast and computed capacity comparison are required. Phases 17 and 19 supply these inputs." />
    <Card><h2 className="text-heading-s">What the dispatcher should review</h2><dl className="detail-grid">
      <div><dt>Weight and volume</dt><dd>Use both limits for every planned vehicle.</dd></div>
      <div><dt>Temperature</dt><dd>Use compatible vehicles for each order.</dd></div>
      <div><dt>Fuel and route count</dt><dd>Check the weekly quota and permitted trips.</dd></div>
      <div><dt>People and depot</dt><dd>Check driver cover and depot allocation.</dd></div>
    </dl></Card>
    <UnavailablePanel title="Proposed action" description="No recommendation can be made until capacity gaps and feasible options have been computed." />
    <Link className="table-link" to="/dispatcher/forecast">Back to forecast</Link>
  </>
}
