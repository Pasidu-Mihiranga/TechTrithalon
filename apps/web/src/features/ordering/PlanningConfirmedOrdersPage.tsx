import { PlanningStageTabs, PlanningPendingStage } from '../planning/PlanningStages'
import { useEffect, useState } from 'react'
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Select } from '../../components'
import { DispatcherOrdersPage } from './DispatcherOrdersPage'
import { useReferenceSummary } from '../shell/useReferenceSummary'
import { api, apiReadError } from '../../lib/apiClient'
import type { components } from '../../generated/api'

type Snapshot = components['schemas']['PlanningSnapshot']
type Comparison = { unchanged: boolean; requiresRegeneration?: boolean; newEligibleOrderIds?: number[] }

export function PlanningConfirmedOrdersPage() {
  const [stage, setStage] = useState(0)
  const summary = useReferenceSummary()
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [depots, setDepots] = useState<string[] | null>(null)
  const [depot, setDepot] = useState('')
  const [date, setDate] = useState('')
  const [depotsError, setDepotsError] = useState<Error | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [comparison, setComparison] = useState<Comparison | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/v1/reference/depots')
        if (cancelled) return
        if (!data) { setDepotsError(apiReadError(response, 'Depots could not be loaded')); return }
        const names = data.filter((n): n is string => Boolean(n))
        setDepots(names)
        setDepot(names[0] ?? '')
      } catch (failure) { if (!cancelled) setDepotsError(failure instanceof Error ? failure : new Error('Depots could not be loaded')) }
    })()
    return () => { cancelled = true }
  }, [])

  const frozenOrders = (snapshot?.inputs?.orders ?? []) as { id: number; ref: string; outletId: string; weightKg: number; volumeM3: number; tempRequirement: string }[]
  const planDate = date || summary.data?.demoOperatingDate || ''

  async function checkSnapshot(id: number) {
    try {
      const { data } = await api.GET('/api/v1/dispatcher/planning/snapshots/{id}/compare', { params: { path: { id } } })
      if (!data) { setError('Snapshot inputs could not be checked.'); return }
      setComparison(data as unknown as Comparison)
    } catch { setError('Snapshot inputs could not be checked. Check your connection and retry.') }
  }

  async function createSnapshot(useSelection: boolean, regenerate = false) {
    setSubmitting(true)
    setError(null)
    try {
      const orderIds = regenerate && snapshot?.selectionMode === 'selected'
        ? snapshot.orderIds
        : useSelection ? [...selectedKeys].map(Number) : undefined
      if (useSelection && (!orderIds || orderIds.length === 0)) {
        setError('Select at least one confirmed order.'); return
      }
      const { data, error: apiError } = await api.POST('/api/v1/dispatcher/planning/snapshots', {
        body: { planDate, depot, orderIds },
      })
      if (!data) {
        const code = apiError && typeof apiError === 'object' && 'code' in apiError ? String((apiError as { code?: string }).code) : undefined
        setError(code === 'ORDERS_NOT_CLOSED' ? 'Orders close at 16:00 Asia/Colombo on the day before delivery.'
          : code === 'SELECTION_INVALID' ? 'Some selected orders are no longer eligible. Refresh and select them again.'
            : code === 'OPERATING_DAY' ? 'Choose an operating delivery day.' : 'The snapshot could not be created.')
        return
      }
      setComparison(null)
      setSnapshot(data)
      await checkSnapshot(data.id)
    } catch { setError('The snapshot could not be created. Check your connection and retry.') }
    finally { setSubmitting(false) }
  }

  async function loadLatestSnapshot() {
    setSubmitting(true)
    setError(null)
    try {
      const { data } = await api.GET('/api/v1/dispatcher/planning/snapshots', { params: { query: { date: planDate, depot } } })
      if (!data) { setError('No snapshot is available for this delivery day and depot.'); return }
      setSnapshot(data)
      setComparison(null)
      await checkSnapshot(data.id)
    } catch { setError('The latest snapshot could not be loaded. Try again.') }
    finally { setSubmitting(false) }
  }

  function clearScope() { setSelectedKeys(new Set()); setSnapshot(null); setComparison(null); setError(null) }

  if (summary.isPending || (depots == null && !depotsError)) return <LoadingState label="Loading planning scope" />
  if (summary.isError || depotsError) return <ErrorState error={depotsError || summary.error} message="Planning dates and depots could not be loaded." />
  if (!depots?.length) return <EmptyState title="No accessible depots" description="A depot must be configured before planning." />

  if (stage !== 0) return <><PlanningStageTabs stage={stage} onChange={setStage} /><PlanningPendingStage stage={stage} /></>

  return (
    <>
      <PlanningStageTabs stage={stage} onChange={setStage} />
      <Card className="toolbar-card">
        <div className="toolbar-row">
          <Input label="Delivery date" type="date" disabled={submitting} value={planDate} onChange={(e) => { setDate(e.target.value); clearScope() }} />
          <Select label="Depot" disabled={submitting} value={depot} onChange={(e) => { setDepot(e.target.value); clearScope() }} options={depots.map((name) => ({ value: name, label: name }))} />
        </div>
      </Card>
      <DispatcherOrdersPage key={`${planDate}:${depot}`} title="Confirmed orders" subtitle="Step 1 · inspect the closed order set and freeze its inputs." selectable selectedKeys={selectedKeys} onSelectedKeysChange={setSelectedKeys} statusFilter="confirmed" date={planDate} depot={depot} />
      <Card className="toolbar-card">
        <div className="toolbar-row">
          <p>{selectedKeys.size} selected</p>
          <Button variant="secondary" disabled={submitting} onClick={() => void loadLatestSnapshot()}>Load latest snapshot</Button>
          <Button variant="secondary" disabled={submitting || selectedKeys.size === 0 || !planDate} onClick={() => void createSnapshot(true)}>Snapshot selection</Button>
          <Button disabled={submitting || !depot || !planDate} onClick={() => void createSnapshot(false)}>{submitting ? 'Freezing…' : 'Snapshot all confirmed'}</Button>
        </div>
        {error && <ErrorState message={error} />}
        {snapshot && (
          <section aria-label="Frozen snapshot">
            <p>Snapshot #{snapshot.id} frozen · {snapshot.orderCount} orders · hash {snapshot.contentHash?.slice(0, 12)}…</p>
            <p>{comparison ? comparison.unchanged ? 'Frozen inputs are unchanged.' : 'Inputs changed. Regenerate before planning.' : 'Input comparison unavailable.'}</p>
            <Button variant="secondary" onClick={() => void checkSnapshot(snapshot.id)}>Check for changes</Button>
            {comparison && !comparison.unchanged && <Button disabled={submitting} onClick={() => void createSnapshot(false, true)}>Regenerate snapshot</Button>}
            <details><summary>Frozen orders</summary><ul>{frozenOrders.map((order) => <li key={order.id}>{order.ref} · {order.outletId} · {order.tempRequirement} · {order.weightKg} kg · {order.volumeM3} m³</li>)}</ul></details>
          </section>
        )}
      </Card>
      <EmptyState title="Plan generation not available yet" description="Generating and validating a plan arrives in Phases 6–9." />
    </>
  )
}
