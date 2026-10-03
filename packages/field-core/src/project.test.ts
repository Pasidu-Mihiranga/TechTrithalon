import { describe, expect, it } from 'vitest'
import { projectHome, projectRows, projectTrip } from './project'
import type { FieldAction } from './types'

const order = (id: number, outcome: object | null = null) => ({ orderId: id, loadedUnits: 12, outcome })
const trip = () => ({
  card: { tripIndex: 1, planDate: '2026-06-26', state: 'READY', stopsDone: 0, ordersDone: 0, issues: 0, startedAt: null, completedAt: null },
  startBlocker: null, currentStopSeq: null,
  stops: [
    { seq: 1, outletId: 'OUT901', status: 'PENDING', arrivedAt: null, departedAt: null, eta: '05:10:00', recorded: 0, orders: [order(1), order(2)] },
    { seq: 2, outletId: 'OUT902', status: 'PENDING', arrivedAt: null, departedAt: null, eta: '05:40:00', recorded: 0, orders: [order(3)] },
  ],
})
let n = 0
const act = (actionType: FieldAction['actionType'], extra: Partial<FieldAction> = {}): FieldAction =>
  ({ clientActionId: `id-${++n}`, actionType, planDate: '2026-06-26', tripIndex: 1, occurredAt: `2026-06-25T23:4${n % 10}:00Z`, ...extra })

describe('projectTrip', () => {
  it('moves the server copy by the actions still in the outbox', () => {
    const actions = [act('TRIP_START'), act('STOP_ARRIVE', { outletId: 'OUT901' }),
      act('ORDER_OUTCOME', { orderId: 1, outcome: 'DELIVERED', recipientName: 'S', proofUploadIds: ['u1'] }),
      act('ORDER_OUTCOME', { orderId: 2, outcome: 'PARTIAL', deliveredUnits: 10, issueKind: 'DAMAGED', recipientName: 'S' }),
      act('STOP_DEPART', { outletId: 'OUT901' })]
    const view = projectTrip(trip(), actions, [{ clientUploadId: 'u1', kind: 'PHOTO' }])
    expect(view.card).toMatchObject({ state: 'IN_PROGRESS', ordersDone: 2, issues: 1, stopsDone: 1 })
    expect(view.stops[0]).toMatchObject({ status: 'COMPLETED', recorded: 2 })
    expect(view.stops[0].orders[0].outcome).toMatchObject({ outcome: 'DELIVERED', deliveredUnits: 12, photos: 1 })
    expect(view.stops[0].orders[1].outcome).toMatchObject({ deliveredUnits: 10, issueKind: 'DAMAGED' })
    expect(view.currentStopSeq).toBe(2)
    expect(trip().card.state).toBe('READY')
  })

  it('does not count an action twice when the server copy already has it', () => {
    const server = trip()
    server.card.state = 'IN_PROGRESS'; server.card.ordersDone = 1
    server.stops[0].status = 'ARRIVED'
    server.stops[0].orders[0].outcome = { outcome: 'DELIVERED' } as never
    server.stops[0].recorded = 1
    const view = projectTrip(server, [act('TRIP_START'), act('STOP_ARRIVE', { outletId: 'OUT901' }), act('ORDER_OUTCOME', { orderId: 1, outcome: 'DELIVERED' })])
    expect(view.card.ordersDone).toBe(1)
    expect(view.stops[0].recorded).toBe(1)
  })

  it('ignores actions for other trips or days', () => {
    const view = projectTrip(trip(), [act('TRIP_START', { tripIndex: 2 }), act('TRIP_START', { planDate: '2026-06-27' })])
    expect(view.card.state).toBe('READY')
  })
})

describe('projectHome and projectRows', () => {
  it('take the projected trips and sum the progress from them', () => {
    const cards = [{ tripIndex: 1, planDate: '2026-06-26', state: 'READY', stops: 2, orders: 3, stopsDone: 0, ordersDone: 0, issues: 0, startedAt: null, completedAt: null },
      { tripIndex: 2, planDate: '2026-06-26', state: 'LOADING', stops: 1, orders: 1, stopsDone: 0, ordersDone: 0, issues: 0, startedAt: null, completedAt: null }]
    const home = { planDate: '2026-06-26', trips: cards, current: cards[0], progress: { stops: 3, stopsDone: 0, orders: 4, ordersDone: 0 } }
    const projected = projectTrip(trip(), [act('TRIP_START'), act('STOP_ARRIVE', { outletId: 'OUT901' }), act('ORDER_OUTCOME', { orderId: 1, outcome: 'DELIVERED', recipientName: 'S' })])
    const view = projectHome(home, [], { 1: projected })
    expect(view.trips[0]).toMatchObject({ state: 'IN_PROGRESS', ordersDone: 1 })
    expect(view.progress).toEqual({ stops: 3, stopsDone: 0, orders: 4, ordersDone: 1 })
    const rows = projectRows([{ tripIndex: 1, seq: 1, status: 'PENDING', completedAt: null }, { tripIndex: 1, seq: 2, status: 'PENDING', completedAt: null }], { 1: projected })
    expect(rows.map(r => r.status)).toEqual(['IN_PROGRESS', 'PENDING'])
  })
})
