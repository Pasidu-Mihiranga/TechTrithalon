import type { FieldAction, ProofUpload } from './types'

/*
 * Local projection: the last trip the server sent, plus the actions still waiting in the outbox, so
 * the driver sees what they did while offline. Projection never invents business numbers: it only
 * moves the server's own counts by the recorded actions, and it is idempotent (an action already
 * reflected in the server copy changes nothing, so a lost response cannot double-count).
 * The shapes below are the fields of the driver API that the projection touches.
 */
export interface OutcomeShape {
  outcome: string; deliveredUnits: number; issueKind: string | null; recipientName: string | null; notes: string | null
  recordedAt: string; photos: number; signatures: number
}
export interface OrderShape { orderId: number; loadedUnits: number; outcome: OutcomeShape | null }
export interface StopShape {
  seq: number; outletId: string; status: string; arrivedAt: string | null; departedAt: string | null; eta: string | null
  recorded: number; orders: OrderShape[]
}
export interface CardShape {
  tripIndex: number; planDate: string; state: string; stopsDone: number; ordersDone: number; issues: number
  startedAt: string | null; completedAt: string | null
}
export interface TripShape { card: CardShape; startBlocker: string | null; currentStopSeq: number | null; stops: StopShape[] }
export interface HomeShape<C extends CardShape = CardShape> {
  planDate: string; trips: C[]; current: C | null
  progress: { stops: number; stopsDone: number; orders: number; ordersDone: number }
}
export interface RowShape { tripIndex: number; seq: number; status: string; completedAt: string | null }

function forTrip(actions: FieldAction[], planDate: string, tripIndex: number) {
  return actions.filter(a => a.planDate === planDate && a.tripIndex === tripIndex)
}

export function projectTrip<T extends TripShape>(trip: T, actions: FieldAction[], uploads: Pick<ProofUpload, 'clientUploadId' | 'kind'>[] = [], settledUploads: Pick<ProofUpload, 'clientUploadId' | 'kind'>[] = []): T {
  const mine = forTrip(actions, trip.card.planDate, trip.card.tripIndex)
  if (mine.length === 0) return trip
  const next: T = structuredClone(trip)
  const card = next.card
  const kinds = new Map([...uploads, ...settledUploads].map(u => [u.clientUploadId, u.kind]))
  for (const a of mine) {
    switch (a.actionType) {
      case 'TRIP_START':
        if (card.state === 'READY' || card.state === 'LOADING') { card.state = 'IN_PROGRESS'; card.startedAt = a.occurredAt; next.startBlocker = null }
        break
      case 'STOP_ARRIVE': {
        const stop = next.stops.find(s => s.outletId === a.outletId)
        if (stop && stop.status === 'PENDING') { stop.status = 'ARRIVED'; stop.arrivedAt = a.occurredAt; stop.eta = null }
        break
      }
      case 'ORDER_OUTCOME': {
        const stop = next.stops.find(s => s.orders.some(o => o.orderId === a.orderId))
        const order = stop?.orders.find(o => o.orderId === a.orderId)
        if (!stop || !order || order.outcome || !a.outcome) break
        const ids = a.proofUploadIds ?? []
        order.outcome = {
          outcome: a.outcome,
          deliveredUnits: a.outcome === 'DELIVERED' ? order.loadedUnits : a.outcome === 'FAILED' ? 0 : a.deliveredUnits ?? 0,
          issueKind: a.issueKind ?? null, recipientName: a.recipientName ?? null, notes: a.notes ?? null, recordedAt: a.occurredAt,
          photos: ids.filter(id => kinds.get(id) === 'PHOTO').length, signatures: ids.filter(id => kinds.get(id) === 'SIGNATURE').length,
        }
        stop.recorded += 1
        card.ordersDone += 1
        if (a.outcome !== 'DELIVERED') card.issues += 1
        break
      }
      case 'STOP_DEPART': {
        const stop = next.stops.find(s => s.outletId === a.outletId)
        if (stop && stop.status !== 'COMPLETED') { stop.status = 'COMPLETED'; stop.departedAt = a.occurredAt; card.stopsDone += 1 }
        break
      }
      case 'TRIP_COMPLETE':
        if (card.state !== 'COMPLETED') { card.state = 'COMPLETED'; card.completedAt = a.occurredAt }
        break
    }
  }
  next.currentStopSeq = card.state === 'IN_PROGRESS'
    ? (next.stops.find(s => s.status === 'ARRIVED') ?? next.stops.find(s => s.status === 'PENDING'))?.seq ?? null
    : null
  return next
}

/**
 * Home: each trip card takes the projected card of that trip when the phone has the trip's detail;
 * otherwise only the start and finish actions move its state. Progress is the sum of the cards.
 */
export function projectHome<C extends CardShape & { stops: number; orders: number }, H extends HomeShape<C>>(home: H, actions: FieldAction[], trips: Partial<Record<number, { card: CardShape }>> = {}): H {
  const relevant = actions.filter(a => a.planDate === home.planDate)
  if (relevant.length === 0 && Object.keys(trips).length === 0) return home
  const next: H = structuredClone(home)
  next.trips = next.trips.map(card => {
    const detail = trips[card.tripIndex]
    if (detail) return { ...card, state: detail.card.state, stopsDone: detail.card.stopsDone, ordersDone: detail.card.ordersDone,
      issues: detail.card.issues, startedAt: detail.card.startedAt, completedAt: detail.card.completedAt }
    const own = forTrip(relevant, home.planDate, card.tripIndex)
    let state = card.state
    if (own.some(a => a.actionType === 'TRIP_START') && (state === 'READY' || state === 'LOADING')) state = 'IN_PROGRESS'
    if (own.some(a => a.actionType === 'TRIP_COMPLETE')) state = 'COMPLETED'
    return { ...card, state }
  })
  next.current = next.trips.find(c => c.state !== 'COMPLETED') ?? null
  next.progress = {
    stops: next.trips.reduce((n, c) => n + c.stops, 0), stopsDone: next.trips.reduce((n, c) => n + c.stopsDone, 0),
    orders: next.trips.reduce((n, c) => n + c.orders, 0), ordersDone: next.trips.reduce((n, c) => n + c.ordersDone, 0),
  }
  return next
}

/** Today's deliveries list: each row takes the status of its stop in the projected trip. */
export function projectRows<R extends RowShape>(rows: R[], trips: Partial<Record<number, TripShape>>): R[] {
  return rows.map(row => {
    const stop = trips[row.tripIndex]?.stops.find(s => s.seq === row.seq)
    if (!stop) return row
    const issue = stop.orders.some(o => o.outcome && o.outcome.outcome !== 'DELIVERED')
    const status = stop.status === 'COMPLETED' ? (issue ? 'ISSUE' : 'DELIVERED') : stop.status === 'ARRIVED' ? 'IN_PROGRESS' : row.status
    return { ...row, status, completedAt: stop.departedAt ?? row.completedAt }
  })
}
