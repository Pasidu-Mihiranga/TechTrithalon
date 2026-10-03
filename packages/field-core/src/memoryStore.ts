import type { NewOutboxEntry, OutboxEntry, OutboxStore, Settlement } from './types'

/** In-memory store: tests, and a fallback when the browser offers no IndexedDB (private windows). */
export class MemoryOutboxStore implements OutboxStore {
  private entries: OutboxEntry[] = []
  private seq = 0
  private meta = new Map<string, string>()
  private snapshots = new Map<string, unknown>()

  async add(entry: NewOutboxEntry): Promise<OutboxEntry> {
    const saved = { ...entry, seq: ++this.seq, state: 'pending' } as OutboxEntry
    this.entries.push(saved)
    return saved
  }
  async all() { return [...this.entries] }
  async settle(seq: number, s: Settlement, at: string) {
    this.entries = this.entries.map(e => e.seq === seq ? { ...e, state: 'settled', settledAt: at, result: s.result, code: s.code ?? undefined,
      message: s.message ?? undefined, review: s.review ?? undefined, clockSkew: s.clockSkew } : e)
  }
  async acknowledge(seqs: number[]) { this.entries = this.entries.map(e => seqs.includes(e.seq) ? { ...e, acknowledged: true } : e) }
  async prune(before: string) { this.entries = this.entries.filter(e => e.state === 'pending' || (e.settledAt ?? '') >= before) }
  async getMeta(key: string) { return this.meta.get(key) }
  async setMeta(key: string, value: string) { this.meta.set(key, value) }
  async saveSnapshot(key: string, value: unknown) { this.snapshots.set(key, structuredClone(value)) }
  async loadSnapshot<T>(key: string) { return this.snapshots.get(key) as T | undefined }
}
