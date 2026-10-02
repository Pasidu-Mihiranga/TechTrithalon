import { EmptyState, PageHeader } from '../components'
import type { RolePage } from './roles'

/** A screen whose backend arrives in a later phase. It says so plainly and shows no sample data. */
export function PlaceholderPage({ page }: { page: RolePage }) {
  return (
    <>
      <PageHeader title={page.title} subtitle={page.description} />
      <EmptyState
        title="Not available yet"
        description={`This screen is built in ${page.phase}. It will show real data from the API; nothing is shown until that exists.`}
      />
    </>
  )
}
