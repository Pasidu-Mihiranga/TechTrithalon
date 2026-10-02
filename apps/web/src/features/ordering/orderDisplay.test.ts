import { describe, expect, it } from 'vitest'
import { formatCutoffCountdown, planningLabel, tempLabel } from './orderDisplay'

describe('orderDisplay', () => {
  it('formats cutoff countdown from server seconds', () => {
    expect(formatCutoffCountdown(2 * 3600 + 14 * 60)).toBe('2h 14m')
    expect(formatCutoffCountdown(45 * 60)).toBe('45m')
  })

  it('maps status and temperature for display only', () => {
    expect(planningLabel('confirmed')).toBe('Unplanned')
    expect(planningLabel('planned')).toBe('Planned')
    expect(tempLabel('chilled')).toBe('Refrigerated')
  })
})
