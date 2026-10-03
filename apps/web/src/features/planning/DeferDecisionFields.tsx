import { Input, Select } from '../../components'
import type { components } from '../../generated/api'
import { DEFER_REASONS, type DeferReasonCode } from './deferralReasons'

type Fairness = components['schemas']['OrderFairness']

export interface DeferDecision {
  reasonCode: DeferReasonCode | ''
  reason: string
  nextDeliveryDate: string
  protectNextRun: boolean
  notifyStore: boolean
}

export const EMPTY_DEFER_DECISION: DeferDecision = {
  reasonCode: '', reason: '', nextDeliveryDate: '', protectNextRun: true, notifyStore: true,
}

export function deferDecisionReady(decision: DeferDecision) {
  return decision.reasonCode !== '' && decision.reason.trim().length > 0
}

/** Body fields shared by the defer endpoint and reasoned replacements. */
export function deferDecisionBody(decision: DeferDecision) {
  return {
    reasonCode: decision.reasonCode || undefined,
    reason: decision.reason.trim(),
    nextDeliveryDate: decision.nextDeliveryDate || undefined,
    protectNextRun: decision.protectNextRun,
    notifyStore: decision.notifyStore,
  }
}

interface Props {
  value: DeferDecision
  onChange: (next: DeferDecision) => void
  /** Server-derived repeat-skip evidence for the order(s) being deferred. */
  fairness?: Fairness[]
  idPrefix: string
  /** Display name for an order ID, e.g. its reference. */
  orderLabel?: (orderId: number) => string
}

/** Reason, next run, protect/notify toggles and the consequence of deferring, all from server evidence. */
export function DeferDecisionFields({ value, onChange, fairness = [], idPrefix, orderLabel = id => `Order ${id}` }: Props) {
  const set = (patch: Partial<DeferDecision>) => onChange({ ...value, ...patch })
  const repeat = fairness.filter(item => item.deferredPreviousOperatingDay)
  const protectedNow = fairness.filter(item => item.protectedThisRun)
  return (
    <div className="defer-fields">
      <Select label="Reason for deferral" required placeholder="Choose a reason" value={value.reasonCode}
        options={DEFER_REASONS.map(reason => ({ value: reason.code, label: reason.rule ? `${reason.label} · ${reason.rule}` : reason.label }))}
        onChange={event => set({ reasonCode: event.target.value as DeferReasonCode | '' })} />
      <Input label="Explanation" required maxLength={500} value={value.reason}
        hint="Recorded with your name and shown to the store when notified."
        onChange={event => set({ reason: event.target.value })} />
      <Input label="Next planning run (optional)" type="date" value={value.nextDeliveryDate}
        hint="Leave empty for the next operating day."
        onChange={event => set({ nextDeliveryDate: event.target.value })} />
      <label className="check-field" htmlFor={`${idPrefix}-protect`}>
        <input id={`${idPrefix}-protect`} type="checkbox" checked={value.protectNextRun}
          onChange={event => set({ protectNextRun: event.target.checked })} />
        <span>Protect on the next run (flagged as first priority)</span>
      </label>
      <label className="check-field" htmlFor={`${idPrefix}-notify`}>
        <input id={`${idPrefix}-notify`} type="checkbox" checked={value.notifyStore}
          onChange={event => set({ notifyStore: event.target.checked })} />
        <span>Notify the store manager</span>
      </label>
      {fairness.length > 0 && (
        <section className={repeat.length || protectedNow.length ? 'consequence-panel' : 'consequence-panel neutral'} aria-label="What this means">
          <h4>What this means</h4>
          <ul>
            {repeat.map(item => (
              <li key={`repeat-${item.orderId}`}>
                {orderLabel(item.orderId)} will be skipped {item.priorConsecutiveDeferrals + 1} operating days in a row
                {item.lastDeferralDate ? `; last deferred ${item.lastDeferralDate}` : ''}
                {item.evidenceSource?.includes('source') ? ' (includes imported scenario data)' : ''}.
              </li>
            ))}
            {protectedNow.map(item => (
              <li key={`protected-${item.orderId}`}>{orderLabel(item.orderId)} was carried into this run as protected from {item.carriedFromDate}.</li>
            ))}
            {fairness.filter(item => item.daysSinceLastServed != null).map(item => (
              <li key={`served-${item.orderId}`}>{orderLabel(item.orderId)}: {item.daysSinceLastServed} days since last served (imported scenario data).</li>
            ))}
            {!repeat.length && !protectedNow.length && <li>No earlier skip is recorded for {fairness.length === 1 ? 'this outlet' : 'these outlets'}.</li>}
            <li>The order{fairness.length === 1 ? '' : 's'} move{fairness.length === 1 ? 's' : ''} to {value.nextDeliveryDate || 'the next operating day'} when the plan is published.</li>
          </ul>
        </section>
      )}
    </div>
  )
}
