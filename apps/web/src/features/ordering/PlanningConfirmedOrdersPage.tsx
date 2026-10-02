import { useEffect, useState } from 'react'
import { Button, Card, EmptyState, ErrorState, LoadingState, Select } from '../../components'
import { DispatcherOrdersPage } from './DispatcherOrdersPage'
import { api } from '../../lib/apiClient'

/**
 * Planning Step 1: inspect confirmed orders, select a set, freeze a snapshot.
 * Plan generation remains a later phase.
 */
export function PlanningConfirmedOrdersPage() {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [depots, setDepots] = useState<string[] | null>(null)
  const [depot, setDepot] = useState('')
  const [depotsError, setDepotsError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<{
    id: number
    contentHash: string
    orderCount: number
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error: loadError } = await api.GET('/api/v1/reference/depots')
      if (cancelled) return
      if (loadError || !data) {
        setDepotsError(true)
        setDepots([])
        return
      }
      const names = data.filter((n): n is string => Boolean(n))
      setDepots(names)
      setDepot((current) => current || names[0] || '')
    })()
    return () => { cancelled = true }
  }, [])

  async function createSnapshot(useSelection: boolean) {
    setSubmitting(true)
    setError(null)
    const orderIds = useSelection
      ? [...selectedKeys].map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : undefined
    if (useSelection && (!orderIds || orderIds.length === 0)) {
      setError('Select at least one confirmed order, or snapshot all confirmed orders.')
      setSubmitting(false)
      return
    }
    if (!depot) {
      setError('Choose a depot before creating a snapshot.')
      setSubmitting(false)
      return
    }
    const { data, error: apiError } = await api.POST('/api/v1/dispatcher/planning/snapshots', {
      body: {
        depot,
        orderIds: orderIds && orderIds.length > 0 ? orderIds : undefined,
      },
    })
    setSubmitting(false)
    if (!data) {
      const code = apiError && typeof apiError === 'object' && 'code' in apiError
        ? String((apiError as { code?: string }).code)
        : undefined
      setError(code === 'OPERATING_DAY'
        ? 'That date is not an operating day.'
        : code === 'SELECTION_INVALID'
          ? 'The selection is not valid for a snapshot.'
          : code === 'DEPOT_REQUIRED'
            ? 'Choose a depot before creating a snapshot.'
            : 'The snapshot could not be created.')
      return
    }
    setSnapshot({
      id: data.id,
      contentHash: data.contentHash ?? '',
      orderCount: data.orderIds?.length ?? 0,
    })
  }

  return (
    <>
      <DispatcherOrdersPage
        title="Confirmed orders"
        subtitle="Step 1 · select the closed order set, then freeze a planning snapshot."
        selectable
        selectedKeys={selectedKeys}
        onSelectedKeysChange={setSelectedKeys}
        statusFilter="confirmed"
      />
      <Card className="toolbar-card">
        {depots == null && <LoadingState rows={1} label="Loading depots" />}
        {depotsError && <ErrorState message="Depots could not be loaded." />}
        {depots && depots.length > 0 && (
          <div className="toolbar-row">
            <Select
              label="Depot"
              value={depot}
              onChange={(e) => setDepot(e.target.value)}
              options={depots.map((name) => ({ value: name, label: name }))}
            />
            <p className="text-body-s text-secondary">
              {selectedKeys.size > 0
                ? `${selectedKeys.size} selected · snapshot will use the selection`
                : 'No selection · snapshot will include all confirmed orders for the depot'}
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={submitting || selectedKeys.size === 0}
              onClick={() => void createSnapshot(true)}
            >
              Snapshot selection
            </Button>
            <Button type="button" disabled={submitting || !depot} onClick={() => void createSnapshot(false)}>
              {submitting ? 'Freezing…' : 'Snapshot all confirmed'}
            </Button>
          </div>
        )}
        {error && <ErrorState message={error} />}
        {snapshot && (
          <p className="text-body-s">
            Snapshot #{snapshot.id} frozen · {snapshot.orderCount} orders · hash {snapshot.contentHash.slice(0, 12)}…
          </p>
        )}
      </Card>
      <EmptyState
        title="Plan generation not available yet"
        description="Snapshots freeze demand and fleet inputs. Generating and validating a plan arrives in Phases 6–9."
      />
    </>
  )
}
