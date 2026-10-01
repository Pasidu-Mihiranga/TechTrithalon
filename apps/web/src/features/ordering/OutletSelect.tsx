import { RemoteSelect } from '../../components/RemoteSelect'
import { useOutlets } from '../../lib/referenceQueries'

interface OutletSelectProps { value: string; onChange: (value: string) => void; disabled?: boolean }

/** The backend scopes options to the current actor's outlet/depot. */
export function OutletSelect(props: OutletSelectProps) {
  const query = useOutlets()
  return <RemoteSelect {...props} label="Outlet" options={(query.data ?? []).map((outlet) => ({
    value: outlet.outletId, label: `${outlet.outletId} · ${outlet.brand} · ${outlet.district}`,
  }))} loading={query.isPending} error={query.error} retry={() => { void query.refetch() }} emptyMessage="No outlets are available for your account." />
}
