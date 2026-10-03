import { SyncEngine } from '@techtrithalon/field-core'
import { createOutboxStore } from './offlineStore'
import { httpSyncTransport } from './syncTransport'

let current: { user: string; engine: SyncEngine } | null = null

/** The signed-in driver's sync engine (one outbox per account on this device). */
export function fieldEngine(user: string): SyncEngine {
  if (!current || current.user !== user) current = { user, engine: new SyncEngine({ store: createOutboxStore(user), transport: httpSyncTransport }) }
  return current.engine
}

/** Tests start from an empty outbox. */
export function resetFieldEngine() { current = null }
