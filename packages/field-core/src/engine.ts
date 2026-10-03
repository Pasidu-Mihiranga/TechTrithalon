import { uuidv7 } from './uuid'
import { AuthError, NetworkError } from './types'
import type { FieldAction, OutboxEntry, OutboxStore, ProofUpload, Settlement, SyncOutcome, SyncTransport } from './types'

export interface SyncStatus {
  /** Entries saved on the phone and not yet confirmed by the server. */
  pending: number
  syncing: boolean
  /** Progress of the current or last run. */
  done: number
  total: number
  lastSyncedAt?: string
  /** The last run stopped: no connection, signed out, or a server fault. Entries stay pending. */
  blocked?: 'offline' | 'signed-out' | 'error'
  /** Settled entries the driver should look at (conflicts, rejections, applied-with-review) and has not acknowledged. */
  needsReview: number
  /** Increments on every change, for memoising projections. */
  version: number
}

export interface EngineOptions {
  store: OutboxStore
  transport: SyncTransport
  now?: () => Date
  /** Actions sent per request. */
  batchSize?: number
}

export type ActionInput = Omit<FieldAction, 'clientActionId' | 'occurredAt'>
export type ActionReport = { state: 'queued' } | { state: 'settled'; result: SyncOutcome; code?: string | null; message?: string | null; review?: string | null }

const LAST_SYNCED = 'lastSyncedAt'

export function needsReview(entry: OutboxEntry) {
  return entry.state === 'settled' && !entry.acknowledged
    && (entry.result === 'CONFLICT' || entry.result === 'REJECTED' || Boolean(entry.review))
}

/**
 * The outbox and its sync loop. Every action is saved to the store before it counts as done; the
 * engine then sends pending entries strictly in creation order (actions batched, proof files one by
 * one before the actions that reference them). A lost connection stops the run and leaves the rest
 * pending; nothing is ever dropped silently. One run at a time.
 */
export class SyncEngine {
  private readonly store: OutboxStore
  private readonly transport: SyncTransport
  private readonly now: () => Date
  private readonly batchSize: number
  private entries: OutboxEntry[] = []
  private status: SyncStatus = { pending: 0, syncing: false, done: 0, total: 0, needsReview: 0, version: 0 }
  private listeners = new Set<(status: SyncStatus) => void>()
  private running: Promise<void> | null = null
  private rerun = false
  private loaded: Promise<void>
  private waiters = new Map<string, (report: ActionReport) => void>()

  constructor(options: EngineOptions) {
    this.store = options.store
    this.transport = options.transport
    this.now = options.now ?? (() => new Date())
    this.batchSize = options.batchSize ?? 25
    this.loaded = this.reload()
  }

  /** Resolves once the saved outbox has been read. */
  ready() { return this.loaded }

  getStatus() { return this.status }

  subscribe(listener: (status: SyncStatus) => void) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Entries not yet confirmed by the server, oldest first (for the local projection). */
  pendingEntries() { return this.entries.filter(e => e.state === 'pending') }

  pendingActions(): FieldAction[] {
    return this.pendingEntries().flatMap(e => e.kind === 'action' ? [e.action] : [])
  }

  pendingUploads(): ProofUpload[] {
    return this.pendingEntries().flatMap(e => e.kind === 'upload' ? [e.upload] : [])
  }

  /** Everything on the phone, newest first, for the sync screen. */
  history() { return [...this.entries].reverse() }

  /**
   * Saves an action (id and device time assigned here) and starts a sync. With `awaitResult`, resolves
   * with the server's answer when it arrives in this run, or `queued` when the phone is offline.
   */
  async enqueueAction(input: ActionInput, label: string, options: { awaitResult?: boolean } = {}): Promise<{ action: FieldAction; report: Promise<ActionReport> }> {
    await this.loaded
    const at = this.now()
    const action: FieldAction = { ...input, clientActionId: uuidv7(at.getTime()), occurredAt: at.toISOString() }
    const report = new Promise<ActionReport>(resolve => {
      if (options.awaitResult) this.waiters.set(action.clientActionId, resolve)
      else resolve({ state: 'queued' })
    })
    // Read the array after the write: a settle may replace it meanwhile.
    const saved = await this.store.add({ kind: 'action', action, label, createdAt: at.toISOString() })
    this.entries = [...this.entries, saved]
    this.publish()
    void this.sync()
    return { action, report }
  }

  async enqueueUpload(input: Omit<ProofUpload, 'clientUploadId'>, label: string): Promise<ProofUpload> {
    await this.loaded
    const at = this.now()
    const upload: ProofUpload = { ...input, clientUploadId: uuidv7(at.getTime()) }
    const saved = await this.store.add({ kind: 'upload', upload, label, createdAt: at.toISOString() })
    this.entries = [...this.entries, saved]
    this.publish()
    void this.sync()
    return upload
  }

  /** Last server copy of a screen's data, kept so the screen opens offline. */
  saveSnapshot(key: string, value: unknown) { return this.store.saveSnapshot(key, value) }
  loadSnapshot<T>(key: string) { return this.store.loadSnapshot<T>(key) }

  /** The driver has read the results on the sync screen. */
  async acknowledge() {
    const seqs = this.entries.filter(needsReview).map(e => e.seq)
    if (seqs.length === 0) return
    await this.store.acknowledge(seqs)
    this.entries = this.entries.map(e => seqs.includes(e.seq) ? { ...e, acknowledged: true } : e)
    this.publish()
  }

  /** Runs a sync pass, or asks the one in flight to go again. Safe to call from any trigger. */
  sync(): Promise<void> {
    if (this.running) { this.rerun = true; return this.running }
    this.running = (async () => {
      await this.loaded
      do {
        this.rerun = false
        await this.pass()
      } while (this.rerun && this.status.blocked === undefined)
    })().finally(() => { this.running = null })
    return this.running
  }

  private async pass() {
    this.status = { ...this.status, syncing: this.pendingEntries().length > 0, done: 0, total: this.pendingEntries().length, blocked: undefined }
    this.publish()
    let done = 0
    let sent = false
    try {
      // Keep going while entries arrive during the run, until the outbox is empty or a request fails.
      for (;;) {
        const queue = this.pendingEntries()
        if (queue.length === 0) break
        this.status = { ...this.status, total: done + queue.length }
        let progressed = false
        let i = 0
        while (i < queue.length) {
          const entry = queue[i]
          if (entry.kind === 'upload') {
            const outcome = await this.transport.uploadProof(entry.upload)
            await this.settle(entry, outcome.ok ? { result: 'APPLIED' } : { result: 'REJECTED', code: outcome.code, message: outcome.message })
            i++; done++; progressed = true
          } else {
            const batch: Extract<OutboxEntry, { kind: 'action' }>[] = []
            while (i < queue.length && queue[i].kind === 'action' && batch.length < this.batchSize) batch.push(queue[i++] as Extract<OutboxEntry, { kind: 'action' }>)
            const results = await this.transport.sendActions(batch.map(e => e.action))
            for (const entry of batch) {
              const result = results.find(r => r.clientActionId === entry.action.clientActionId)
              // A missing result means the server never saw it; it stays pending for the next run.
              if (!result) continue
              await this.settle(entry, { result: result.result, code: result.code, message: result.message, review: result.review, clockSkew: result.clockSkew })
              done++; progressed = true
            }
          }
          sent = true
          this.status = { ...this.status, done }
          this.publish()
        }
        if (!progressed) break
      }
      if (sent) {
        const at = this.now().toISOString()
        await this.store.setMeta(LAST_SYNCED, at)
        this.status = { ...this.status, lastSyncedAt: at }
      }
    } catch (error) {
      if (error instanceof NetworkError) this.status = { ...this.status, blocked: 'offline' }
      else if (error instanceof AuthError) this.status = { ...this.status, blocked: 'signed-out' }
      // Anything else (a server fault): keep everything pending and try again on the next trigger.
      else this.status = { ...this.status, blocked: 'error' }
    } finally {
      // Anyone still waiting on an unsettled action is told it is saved and queued.
      for (const [id, resolve] of this.waiters) { resolve({ state: 'queued' }); this.waiters.delete(id) }
      this.status = { ...this.status, syncing: false }
      this.publish()
    }
  }

  private async settle(entry: OutboxEntry, settlement: Settlement) {
    const at = this.now().toISOString()
    await this.store.settle(entry.seq, settlement, at)
    const settled: OutboxEntry = { ...entry, state: 'settled', settledAt: at, result: settlement.result, code: settlement.code ?? undefined,
      message: settlement.message ?? undefined, review: settlement.review ?? undefined, clockSkew: settlement.clockSkew }
    this.entries = this.entries.map(e => e.seq === entry.seq ? settled : e)
    if (entry.kind === 'action') {
      const resolve = this.waiters.get(entry.action.clientActionId)
      if (resolve) {
        this.waiters.delete(entry.action.clientActionId)
        resolve({ state: 'settled', result: settlement.result, code: settlement.code, message: settlement.message, review: settlement.review })
      }
    }
  }

  private async reload() {
    // Settled entries are kept a week for the sync screen; pending entries are never pruned.
    await this.store.prune(new Date(this.now().getTime() - 7 * 24 * 3600 * 1000).toISOString())
    this.entries = await this.store.all()
    this.status = { ...this.status, lastSyncedAt: await this.store.getMeta(LAST_SYNCED) }
    this.publish()
  }

  private publish() {
    this.status = {
      ...this.status,
      pending: this.entries.filter(e => e.state === 'pending').length,
      needsReview: this.entries.filter(needsReview).length,
      version: this.status.version + 1,
    }
    for (const listener of this.listeners) listener(this.status)
  }
}
