import type { HTMLAttributes } from 'react'
import { Badge } from './Badge'
import { Card } from './Card'

export interface ConstraintViolationData {
  ruleCode: string
  severity: 'HARD' | 'INFO'
  scope?: string
  entityType?: string
  entityId?: string
  message: string
  actualValue?: string
  allowedValue?: string
  remediationCode?: string
}

export interface ViolationCardProps extends HTMLAttributes<HTMLDivElement> {
  violation: ConstraintViolationData
  onDismiss?: () => void
}

/**
 * Renders an operational constraint violation with rule code, human message,
 * actual vs allowed values, and remediation code.
 */
export function ViolationCard({
  violation,
  onDismiss,
  className,
  ...rest
}: ViolationCardProps) {
  const isHard = violation.severity === 'HARD'

  return (
    <Card
      {...rest}
      className={[
        'violation-card',
        isHard ? 'violation-hard' : 'violation-info',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="violation-header">
        <div className="violation-badges">
          <Badge tone={isHard ? 'danger' : 'neutral'}>
            {violation.severity}
          </Badge>
          <code className="violation-code">{violation.ruleCode}</code>
          {violation.remediationCode ? (
            <span className="violation-remediation">
              {violation.remediationCode}
            </span>
          ) : null}
        </div>
        {onDismiss ? (
          <button
            type="button"
            className="icon-btn"
            onClick={onDismiss}
            aria-label="Dismiss violation"
          >
            ×
          </button>
        ) : null}
      </div>

      <p className="violation-message">{violation.message}</p>

      {violation.actualValue || violation.allowedValue ? (
        <div className="violation-comparison">
          <span className="comparison-item">
            Actual: <strong>{violation.actualValue ?? 'N/A'}</strong>
          </span>
          <span className="comparison-separator">|</span>
          <span className="comparison-item">
            Allowed: <strong>{violation.allowedValue ?? 'N/A'}</strong>
          </span>
        </div>
      ) : null}
    </Card>
  )
}
