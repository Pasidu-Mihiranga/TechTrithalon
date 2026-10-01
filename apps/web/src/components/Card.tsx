import type { HTMLAttributes, ReactNode } from 'react'

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={['card', className].filter(Boolean).join(' ')} />
}

interface MetricCardProps {
  label: string
  /** Formatted value. The number must come from the API; this component never computes it. */
  value: ReactNode
  caption?: ReactNode
}

export function MetricCard({ label, value, caption }: MetricCardProps) {
  return (
    <Card className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {caption ? <span className="metric-caption">{caption}</span> : null}
    </Card>
  )
}
