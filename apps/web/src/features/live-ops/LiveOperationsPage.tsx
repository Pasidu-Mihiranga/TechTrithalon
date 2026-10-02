import { PageHeader } from '../../components'
import { UnavailablePanel } from '../../components/UnavailablePanel'

export function LiveOperationsPage() {
  return <>
    <PageHeader title="Live Operations" subtitle="Fleet progress, current stops and last updates." />
    <div className="split-view">
      <UnavailablePanel title="Active vehicles" description="Phase 16 supplies active trips and delivery progress." />
      <UnavailablePanel title="Route map" description="The map requires published routes and live trip data. No routes are available yet." />
    </div>
  </>
}
