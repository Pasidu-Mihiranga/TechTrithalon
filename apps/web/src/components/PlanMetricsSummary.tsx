import type { HTMLAttributes } from 'react'
import { MetricCard } from './Card'

export interface PlanMetricsData {
  ordersAssigned: number
  ordersUnassigned: number
  vehiclesUsed: number
  tripsUsed: number
  totalDistanceKm: number | string
  totalFuelLitres: number | string
  avgVolumeUtilisation?: number | string
  avgWeightUtilisation?: number | string
  hardViolationCount?: number
}

export interface PlanMetricsSummaryProps extends HTMLAttributes<HTMLDivElement> {
  metrics: PlanMetricsData
}

/**
 * Summary bar displaying high-level plan metrics:
 * assigned/unassigned counts, fleet usage, distance, fuel, and constraint status.
 */
export function PlanMetricsSummary({
  metrics,
  className,
  ...rest
}: PlanMetricsSummaryProps) {
  const totalOrders = metrics.ordersAssigned + metrics.ordersUnassigned

  return (
    <div
      {...rest}
      className={['plan-metrics-summary', className].filter(Boolean).join(' ')}
    >
      <div className="metrics-grid">
        <MetricCard
          label="Orders Assigned"
          value={`${metrics.ordersAssigned} / ${totalOrders}`}
          caption={
            metrics.ordersUnassigned > 0
              ? `${metrics.ordersUnassigned} unassigned`
              : 'All orders scheduled'
          }
        />
        <MetricCard
          label="Fleet Active"
          value={metrics.vehiclesUsed}
          caption={`${metrics.tripsUsed} trips`}
        />
        <MetricCard
          label="Total Distance"
          value={`${metrics.totalDistanceKm} km`}
          caption={`${metrics.totalFuelLitres} L fuel`}
        />
        <MetricCard
          label="Constraint Status"
          value={
            (metrics.hardViolationCount ?? 0) === 0 ? (
              <span className="text-success">Feasible</span>
            ) : (
              <span className="text-danger">
                {metrics.hardViolationCount} Violations
              </span>
            )
          }
          caption={
            (metrics.hardViolationCount ?? 0) === 0
              ? 'Ready for dispatch'
              : 'Requires resolution'
          }
        />
      </div>
    </div>
  )
}
