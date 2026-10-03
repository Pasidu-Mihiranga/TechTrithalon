import { describe, expect, it, vi } from 'vitest'
import { SyncEngine } from './engine'
import { MemoryOutboxStore } from './memoryStore'
import { AuthError, NetworkError } from './types'
import type { FieldAction, SyncResult, SyncTransport } from './types'
import { uuidv7 } from './uuid'

function transport(overrides: Partial<SyncTransport> = {}) {
  const sent: FieldAction[][] = []
  const t: SyncTransport & { sent: FieldAction[][] } = {
    sent,
    sendActions: vi.fn(async (actions: FieldAction[]) => { sent.push(actions); return actions.map(a => ({ clientActionId: a.clientActionId, result: 'APPLIED' }) as SyncResult) }),
    uploadProof: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  }
  return t
}
const base = { planDate: '2026-06-26', tripIndex: 1 }

describe('uuidv7', () => {
  it('is a version 7 UUID that sorts by time', () => {
    const a = uuidv7(1_700_000_000_000), b = uuidv7(1_700_000_000_001)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a < b).toBe(true)
  })
})

describe('SyncEngine', () => {
  it('saves before sending, sends in creation order and settles each action once', async () => {
    const store = new MemoryOutboxStore()
    const t = transport()
    const engine = new SyncEngine({ store, transport: t })
    await engine.enqueueAction({ ...base, actionType: 'TRIP_START' }, 'Trip 1 started')
    await engine.enqueueAction({ ...base, actionType: 'STOP_ARRIVE', outletId: 'OUT901' }, 'Arrived OUT901')
    await engine.sync()
    expect(t.sent.flat().map(a => a.actionType)).toEqual(['TRIP_START', 'STOP_ARRIVE'])
    expect(engine.getStatus().pending).toBe(0)
    expect(engine.getStatus().lastSyncedAt).toBeDefined()
    expect((await store.all()).every(e => e.state === 'settled')).toBe(true)
    await engine.sync()
    expect(t.sent.flat()).toHaveLength(2)
  })

  it('keeps everything pending without a connection and resumes in order when it returns', async () => {
    const store = new MemoryOutboxStore()
    let online = false
    const t = transport({ sendActions: vi.fn(async (actions: FieldAction[]) => {
      if (!online) throw new NetworkError()
      return actions.map(a => ({ clientActionId: a.clientActionId, result: 'APPLIED' as const }))
    }) })
    const engine = new SyncEngine({ store, transport: t })
    const { report } = await engine.enqueueAction({ ...base, actionType: 'TRIP_START' }, 'Trip 1 started', { awaitResult: true })
    expect(await report).toEqual({ state: 'queued' })
    await engine.enqueueAction({ ...base, actionType: 'STOP_ARRIVE', outletId: 'OUT901' }, 'Arrived')
    await engine.sync()
    expect(engine.getStatus()).toMatchObject({ pending: 2, blocked: 'offline', syncing: false })
    // A restart reads the saved outbox back.
    const restarted = new SyncEngine({ store, transport: t })
    await restarted.ready()
    expect(restarted.pendingActions().map(a => a.actionType)).toEqual(['TRIP_START', 'STOP_ARRIVE'])
    online = true
    await restarted.sync()
    expect(restarted.getStatus()).toMatchObject({ pending: 0, blocked: undefined })
  })

  it('uploads proof files before the outcome that references them and reports conflicts for review', async () => {
    const order: string[] = []
    const t = transport({
      uploadProof: vi.fn(async () => { order.push('upload'); return { ok: true as const } }),
      sendActions: vi.fn(async (actions: FieldAction[]) => {
        order.push(...actions.map(a => a.actionType))
        return actions.map(a => ({ clientActionId: a.clientActionId, result: a.actionType === 'ORDER_OUTCOME' ? 'CONFLICT' as const : 'APPLIED' as const,
          code: a.actionType === 'ORDER_OUTCOME' ? 'ORDER_ALREADY_RECORDED' : null }))
      }),
    })
    const engine = new SyncEngine({ store: new MemoryOutboxStore(), transport: t })
    await engine.enqueueAction({ ...base, actionType: 'STOP_ARRIVE', outletId: 'OUT901' }, 'Arrived')
    const upload = await engine.enqueueUpload({ ...base, orderId: 901, kind: 'PHOTO', blob: new Blob(['x']) }, 'Photo')
    const { report } = await engine.enqueueAction({ ...base, actionType: 'ORDER_OUTCOME', orderId: 901, outcome: 'DELIVERED',
      recipientName: 'S', proofUploadIds: [upload.clientUploadId] }, 'Delivered', { awaitResult: true })
    await engine.sync()
    expect(order).toEqual(['STOP_ARRIVE', 'upload', 'ORDER_OUTCOME'])
    expect(await report).toMatchObject({ state: 'settled', result: 'CONFLICT', code: 'ORDER_ALREADY_RECORDED' })
    expect(engine.getStatus().needsReview).toBe(1)
    await engine.acknowledge()
    expect(engine.getStatus().needsReview).toBe(0)
  })

  it('leaves an action pending when the server did not answer for it', async () => {
    const t = transport({ sendActions: vi.fn(async () => []) })
    const engine = new SyncEngine({ store: new MemoryOutboxStore(), transport: t })
    await engine.enqueueAction({ ...base, actionType: 'TRIP_START' }, 'Trip 1 started')
    await engine.sync()
    expect(engine.getStatus().pending).toBe(1)
  })

  it('keeps actions when the session expired and syncs them after signing in again', async () => {
    let signedIn = false
    const t = transport({ sendActions: vi.fn(async (actions: FieldAction[]) => {
      if (!signedIn) throw new AuthError()
      return actions.map(a => ({ clientActionId: a.clientActionId, result: 'APPLIED' as const }))
    }) })
    const engine = new SyncEngine({ store: new MemoryOutboxStore(), transport: t })
    await engine.enqueueAction({ ...base, actionType: 'TRIP_START' }, 'Trip 1 started')
    await engine.sync()
    expect(engine.getStatus()).toMatchObject({ pending: 1, blocked: 'signed-out' })
    signedIn = true
    await engine.sync()
    expect(engine.getStatus()).toMatchObject({ pending: 0, blocked: undefined })
  })
})
