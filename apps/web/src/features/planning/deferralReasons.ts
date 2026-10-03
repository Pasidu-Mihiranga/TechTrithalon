import type { components } from '../../generated/api'

export type DeferReasonCode = NonNullable<components['schemas']['ManualPlanDeferRequest']['reasonCode']>

/** The five Figma defer-dialog reasons and the named constraint each one cites. */
export const DEFER_REASONS: ReadonlyArray<{ code: DeferReasonCode; label: string; rule?: string }> = [
  { code: 'CAPACITY', label: 'Capacity constraint on current run', rule: 'R6 Trip capacity' },
  { code: 'NO_REEFER', label: 'No refrigerated vehicle available', rule: 'R2 Temperature' },
  { code: 'WINDOW_CONFLICT', label: 'Store window closed during planned arrival', rule: 'R8 Delivery window' },
  { code: 'VAN_ACCESS', label: 'Van access limitation', rule: 'R3 Vehicle access' },
  { code: 'OTHER', label: 'Other (explain below)' },
]

export function deferReasonLabel(code?: string | null) {
  return DEFER_REASONS.find(reason => reason.code === code)?.label ?? code ?? 'Not recorded'
}
