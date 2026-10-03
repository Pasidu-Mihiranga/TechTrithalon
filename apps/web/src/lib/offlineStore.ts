import Dexie from 'dexie'
import type { Table } from 'dexie'
import { MemoryOutboxStore } from '@techtrithalon/field-core'
import type { NewOutboxEntry, OutboxEntry, OutboxStore, Settlement } from '@techtrithalon/field-core'

type Row = OutboxEntry
interface Meta { key: string; value: string }
interface Snapshot { key: string; value: unknown; savedAt: string }

/**
 * The driver's outbox and last-known trip data in IndexedDB (via Dexie). Proof photos stay here as
 * blobs until the server has them. One database per signed-in user, so a shared phone never mixes
 * two drivers' queues.
 */
class WaypointFieldDb extends Dexie {
  outbox!: Table<Row, number>
  meta!: Table<Meta, string>
  snapshots!: Table<Snapshot, string>
  constructor(name: string) {
    super(name)
    this.version(1).stores({ outbox: '++seq, state, settledAt', meta: 'key', snapshots: 'key' })
  }
}

export class IndexedDbOutboxStore implements OutboxStore {
  private readonly db: WaypointFieldDb
  constructor(user: string) { this.db = new WaypointFieldDb(`waypoint-field-${user}`) }

  async add(entry: NewOutboxEntry): Promise<OutboxEntry> {
    const row = { ...entry, state: 'pending' } as Omit<Row, 'seq'>
    const seq = await this.db.outbox.add(row as Row)
    return { ...row, seq } as Row
  }
  all() { return this.db.outbox.orderBy('seq').toArray() }
  async settle(seq: number, s: Settlement, at: string) {
    await this.db.outbox.update(seq, { state: 'settled', settledAt: at, result: s.result, code: s.code ?? undefined,
      message: s.message ?? undefined, review: s.review ?? undefined, clockSkew: s.clockSkew })
  }
  async acknowledge(seqs: number[]) {
    await this.db.transaction('rw', this.db.outbox, () => Promise.all(seqs.map(seq => this.db.outbox.update(seq, { acknowledged: true }))))
  }
  async prune(before: string) {
    await this.db.outbox.where('settledAt').below(before).filter(e => e.state === 'settled').delete()
  }
  async getMeta(key: string) { return (await this.db.meta.get(key))?.value }
  async setMeta(key: string, value: string) { await this.db.meta.put({ key, value }) }
  async saveSnapshot(key: string, value: unknown) { await this.db.snapshots.put({ key, value, savedAt: new Date().toISOString() }) }
  async loadSnapshot<T>(key: string) { return (await this.db.snapshots.get(key))?.value as T | undefined }
}

/** IndexedDB when the browser has it (all supported phones); memory otherwise, so the app still works. */
export function createOutboxStore(user: string): OutboxStore {
  return typeof indexedDB === 'undefined' ? new MemoryOutboxStore() : new IndexedDbOutboxStore(user)
}
