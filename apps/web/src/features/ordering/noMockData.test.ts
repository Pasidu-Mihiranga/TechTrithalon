import { describe, expect, it } from 'vitest'
import * as orderQueries from './orderQueries'
import * as fleetQueries from '../fleet/fleetQueries'

describe('feature data access', () => {
  it('exposes only API query hooks (no fixture exporters)', () => {
    const ordering = Object.keys(orderQueries).sort()
    const fleet = Object.keys(fleetQueries).sort()
    expect(ordering).toEqual([
      'useDispatcherDashboard',
      'useDispatcherOrder',
      'useDispatcherOrders',
      'useStoreCutoff',
      'useStoreOrder',
      'useStoreOrders',
    ])
    expect(fleet).toEqual(['useFleet', 'useFleetVehicle'])
    expect(ordering.join()).not.toMatch(/mock|fixture|sample/i)
    expect(fleet.join()).not.toMatch(/mock|fixture|sample/i)
  })
})
