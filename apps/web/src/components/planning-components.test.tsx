import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  ConstraintChip,
  PlanMetricsSummary,
  UtilisationBar,
  ViolationCard,
} from '.'

describe('UtilisationBar', () => {
  it('renders labels, values, percentages, and progressbar semantics', () => {
    render(
      <UtilisationBar
        label="Volume"
        actual={30}
        limit={40}
        unit="m³"
      />
    )

    expect(screen.getByText('Volume')).toBeVisible()
    expect(screen.getByText(/30/)).toBeVisible()
    expect(screen.getByText(/40 m³/)).toBeVisible()
    expect(screen.getByText('(75%)')).toBeVisible()

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '30')
    expect(bar).toHaveAttribute('aria-valuemax', '40')
  })

  it('marks danger when actual exceeds limit', () => {
    const { container } = render(
      <UtilisationBar
        label="Weight"
        actual={5500}
        limit={5000}
        unit="kg"
      />
    )

    const fill = container.querySelector('.utilisation-fill')
    expect(fill).toHaveClass('danger')
    expect(screen.getByText('(100%)')).toBeVisible()
  })

  it('marks warning when actual is above 85% of limit', () => {
    const { container } = render(
      <UtilisationBar
        label="Time"
        actual={240}
        limit={270}
        unit="min"
      />
    )

    const fill = container.querySelector('.utilisation-fill')
    expect(fill).toHaveClass('warning')
  })
})

describe('ConstraintChip', () => {
  it('renders appropriate labels and classes for different constraint kinds', () => {
    const { rerender } = render(<ConstraintChip kind="van_only" />)
    expect(screen.getByText('Van Only')).toHaveClass('badge-type-van')

    rerender(<ConstraintChip kind="chilled" />)
    expect(screen.getByText('Chilled')).toHaveClass('badge-type-fridge')

    rerender(<ConstraintChip kind="mall_window" />)
    expect(screen.getByText('Mall Window')).toHaveClass('badge-warning')

    rerender(<ConstraintChip kind="overflow" />)
    expect(screen.getByText('Capacity Overflow')).toHaveClass('badge-danger')
  })

  it('allows custom override label', () => {
    render(<ConstraintChip kind="custom" label="Custom Rule" />)
    expect(screen.getByText('Custom Rule')).toBeVisible()
  })
})

describe('ViolationCard', () => {
  it('renders rule code, message, actual vs allowed values, and severity', () => {
    render(
      <ViolationCard
        violation={{
          ruleCode: 'TRIP_CAPACITY',
          severity: 'HARD',
          message: 'Trip volume exceeds vehicle capacity',
          actualValue: '42.5 m³',
          allowedValue: '38.0 m³',
          remediationCode: 'OVER_VOLUME',
        }}
      />
    )

    expect(screen.getByText('TRIP_CAPACITY')).toBeVisible()
    expect(screen.getByText('HARD')).toBeVisible()
    expect(screen.getByText('OVER_VOLUME')).toBeVisible()
    expect(screen.getByText('Trip volume exceeds vehicle capacity')).toBeVisible()
    expect(screen.getByText('42.5 m³')).toBeVisible()
    expect(screen.getByText('38.0 m³')).toBeVisible()
  })

  it('handles optional dismiss callback', async () => {
    const onDismiss = vi.fn()
    render(
      <ViolationCard
        violation={{
          ruleCode: 'OPERATING_DAY',
          severity: 'HARD',
          message: 'Sunday is a non-operating day',
        }}
        onDismiss={onDismiss}
      />
    )

    const button = screen.getByRole('button', { name: 'Dismiss violation' })
    await userEvent.click(button)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})

describe('PlanMetricsSummary', () => {
  it('renders all metrics including assigned/unassigned and feasibility status', () => {
    render(
      <PlanMetricsSummary
        metrics={{
          ordersAssigned: 80,
          ordersUnassigned: 5,
          vehiclesUsed: 14,
          tripsUsed: 22,
          totalDistanceKm: '412.50',
          totalFuelLitres: '58.20',
          hardViolationCount: 0,
        }}
      />
    )

    expect(screen.getByText('80 / 85')).toBeVisible()
    expect(screen.getByText('5 unassigned')).toBeVisible()
    expect(screen.getByText('14')).toBeVisible()
    expect(screen.getByText('22 trips')).toBeVisible()
    expect(screen.getByText('412.50 km')).toBeVisible()
    expect(screen.getByText('58.20 L fuel')).toBeVisible()
    expect(screen.getByText('Feasible')).toBeVisible()
  })

  it('highlights violation count when plan is infeasible', () => {
    render(
      <PlanMetricsSummary
        metrics={{
          ordersAssigned: 50,
          ordersUnassigned: 35,
          vehiclesUsed: 10,
          tripsUsed: 15,
          totalDistanceKm: '300.00',
          totalFuelLitres: '45.00',
          hardViolationCount: 3,
        }}
      />
    )

    expect(screen.getByText('3 Violations')).toBeVisible()
    expect(screen.getByText('Requires resolution')).toBeVisible()
  })
})
