/** Outbox action types; they mirror the API's SyncAction. */
export type ActionType = 'TRIP_START' | 'STOP_ARRIVE' | 'ORDER_OUTCOME' | 'STOP_DEPART' | 'TRIP_COMPLETE'
export type Outcome = 'DELIVERED' | 'PARTIAL' | 'FAILED'
export type SyncOutcome = 'APPLIED' | 'DUPLICATE' | 'CONFLICT' | 'REJECTED'

/** One driver action, saved on the phone before anything is sent. Ids are UUIDv7, made on the device. */
export interface FieldAction {
  clientActionId: string
  actionType: ActionType
  planDate: string
  tripIndex: number
  planVersion?: number
  /** Device time (ISO 8601). */
  occurredAt: string
  outletId?: string
  orderId?: number
  outcome?: Outcome
  deliveredUnits?: number
  issueKind?: string
  recipientName?: string
  notes?: string
  proofUploadIds?: string[]
}

/** A proof photo or signature waiting to upload. The bytes stay on the phone until the server has them. */
export interface ProofUpload {
  clientUploadId: string
  planDate: string
  tripIndex: number
  orderId: number
  kind: 'PHOTO' | 'SIGNATURE'
  blob: Blob
}

export type EntryState = 'pending' | 'settled'

interface EntryBase {
  /** Order of creation on this device; the engine sends entries in this order. */
  seq: number
  createdAt: string
  /** Short human label for the sync screen, for example "SYN001 delivered". */
  label: string
  state: EntryState
  settledAt?: string
  result?: SyncOutcome
  code?: string
  message?: string
  review?: string
  clockSkew?: boolean
  /** The driver has seen this result on the sync screen. */
  acknowledged?: boolean
}
export type OutboxEntry =
  | (EntryBase & { kind: 'action'; action: FieldAction })
  | (EntryBase & { kind: 'upload'; upload: ProofUpload })
export type NewOutboxEntry =
  | { kind: 'action'; action: FieldAction; label: string; createdAt: string }
  | { kind: 'upload'; upload: ProofUpload; label: string; createdAt: string }

export interface SyncResult {
  clientActionId: string
  result: SyncOutcome
  code?: string | null
  message?: string | null
  review?: string | null
  detail?: Record<string, unknown> | null
  clockSkew?: boolean
}

export interface Settlement {
  result: SyncOutcome
  code?: string | null
  message?: string | null
  review?: string | null
  clockSkew?: boolean
}

/** Storage port: IndexedDB on the web, SQLite or similar in the native app. */
export interface OutboxStore {
  add(entry: NewOutboxEntry): Promise<OutboxEntry>
  /** Every entry, oldest first. */
  all(): Promise<OutboxEntry[]>
  settle(seq: number, settlement: Settlement, at: string): Promise<void>
  acknowledge(seqs: number[]): Promise<void>
  /** Drops settled entries older than the cutoff (ISO time). */
  prune(before: string): Promise<void>
  getMeta(key: string): Promise<string | undefined>
  setMeta(key: string, value: string): Promise<void>
  saveSnapshot(key: string, value: unknown): Promise<void>
  loadSnapshot<T>(key: string): Promise<T | undefined>
}

/** Thrown by a transport when the request never reached the server or the answer was lost. */
export class NetworkError extends Error {
  constructor(message = 'No connection') { super(message); this.name = 'NetworkError' }
}
/** The session ended; the driver must sign in again before syncing. */
export class AuthError extends Error {
  constructor(message = 'Signed out') { super(message); this.name = 'AuthError' }
}

export type UploadOutcome = { ok: true } | { ok: false; code?: string; message?: string }

/** Transport port: the HTTP API on the web. Throws NetworkError or AuthError for retryable failures. */
export interface SyncTransport {
  sendActions(actions: FieldAction[]): Promise<SyncResult[]>
  /** `ok: false` is a permanent refusal (invalid file, order already recorded); it is not retried. */
  uploadProof(upload: ProofUpload): Promise<UploadOutcome>
}
