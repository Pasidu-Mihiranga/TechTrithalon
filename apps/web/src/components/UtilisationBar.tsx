import type { HTMLAttributes } from 'react'

export type UtilisationStatus = 'normal' | 'warning' | 'danger'

export interface UtilisationBarProps extends HTMLAttributes<HTMLDivElement> {
  label: string
  actual: number
  limit: number
  unit: string
  status?: UtilisationStatus
  compact?: boolean
}

/**
 * Visual capacity and budget utilisation bar (e.g. Volume, Weight, Time, Fuel).
 * Displays a filled meter with percentage and human-readable actual / limit labels.
 */
export function UtilisationBar({
  label,
  actual,
  limit,
  unit,
  status,
  compact = false,
  className,
  ...rest
}: UtilisationBarProps) {
  const safeLimit = limit > 0 ? limit : 1
  const percent = Math.min(100, Math.max(0, Math.round((actual / safeLimit) * 100)))

  const computedStatus: UtilisationStatus = status
    ? status
    : actual > limit
    ? 'danger'
    : actual >= limit * 0.85
    ? 'warning'
    : 'normal'

  return (
    <div
      {...rest}
      className={['utilisation-group', compact ? 'compact' : '', className].filter(Boolean).join(' ')}
    >
      <div className="utilisation-header">
        <span className="utilisation-label">{label}</span>
        <span className={`utilisation-values ${computedStatus}`}>
          <strong>{actual.toLocaleString()}</strong> / {limit.toLocaleString()} {unit}
          <span className="utilisation-pct">({percent}%)</span>
        </span>
      </div>
      <div
        className="utilisation-track"
        role="progressbar"
        aria-valuenow={actual}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={`${label} utilisation: ${actual} of ${limit} ${unit}`}
      >
        <div
          className={`utilisation-fill ${computedStatus}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
