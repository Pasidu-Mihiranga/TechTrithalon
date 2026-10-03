import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { projectHome, projectRows, projectTrip } from '@techtrithalon/field-core'
import type { ActionInput, Outcome, SyncEngine } from '@techtrithalon/field-core'
import { api } from '../../lib/apiClient'
import { useFieldSync } from '../offline/useFieldSync'
import type { components } from '../../generated/api'

type Schema = components['schemas']
// Driver hooks use networkMode 'always': offline, reads fall back to the copy saved on the phone and
// writes go to the outbox, instead of TanStack Query pausing them until the connection returns.

/** The driver API serialises every field (null when absent); springdoc marks record fields optional. */
type Present<T> = T extends (infer U)[] ? Present<U>[]
  : T extends object ? { [K in keyof T]-?: Present<NonNullable<T[K]>> | Extract<T[K], null> } : T
export type DriverHome = Present<Schema['DriverHome']>
export type DriverTripCard = Present<Schema['DriverTripCard']>
export type DriverTripDetail = Present<Schema['DriverTripDetail']>
export type DriverStop = Present<Schema['DriverStop']>
export type DriverOrder = Present<Schema['DriverOrder']>
export type DriverOutcome = Present<Schema['DriverOutcome']>
export type DriverDeliveries = Present<Schema['DriverDeliveries']>
export type DriverDeliveryRow = Present<Schema['DriverDeliveryRow']>
export type DriverPastTrip = Present<Schema['DriverPastTrip']>
export type DriverOrderDetail = Present<Schema['DriverOrderDetail']>
export type DriverCapabilities = Present<Schema['DriverCapabilities']>
export type OutcomeBody = Omit<Schema['DriverOutcomeRequest'], 'expectedVersion' | 'proofIds'> & { proofUploadIds?: string[] }
export type IssueKind = NonNullable<OutcomeBody['issueKind']>

/** Keeps the server's code, trace id and recovery facts (current plan version, pending orders). */
export class DriverRequestError extends Error {
  readonly status: number
  readonly code?: string
  readonly traceId?: string
  readonly pendingOrders: string[]
  constructor(response: Response, payload: unknown, fallback = 'The request failed.') {
    const body = (payload && typeof payload === 'object' ? payload : {}) as {
      detail?: string; code?: string; traceId?: string; pendingOrders?: string[]
    }
    super(body.detail || fallback)
    this.status = response.status
    this.code = body.code
    this.traceId = body.traceId
    this.pendingOrders = body.pendingOrders ?? []
  }
}

/** Saved copy of the last server answer, so the driver's screens open without a connection. */
type Snapshotted<T> = T & { readonly __fromCache?: boolean }

async function withSnapshot<T>(engine: SyncEngine | null, key: string, fetcher: () => Promise<T>): Promise<Snapshotted<T>> {
  try {
    const data = await fetcher()
    if (engine) void engine.saveSnapshot(key, data)
    return data as Snapshotted<T>
  } catch (error) {
    if (!(error instanceof OfflineError) || !engine) throw error
    const saved = await engine.loadSnapshot<T>(key)
    if (saved === undefined) throw error
    return { ...saved, __fromCache: true }
  }
}

/** Raised when the request never reached the server (no connection). */
export class OfflineError extends Error {
  readonly status = 0
  constructor() { super('You are offline and this screen has not been opened online yet.') }
}

/** Runs an API read; a failed fetch (no connection) becomes OfflineError, an HTTP error a DriverRequestError. */
async function read<T>(request: () => Promise<{ data?: unknown; error?: unknown; response: Response }>, fallback: string): Promise<T> {
  let result
  try { result = await request() } catch { throw new OfflineError() }
  if (!result.data) throw new DriverRequestError(result.response, result.error, fallback)
  return result.data as T
}

const tripKey = (tripIndex: number | undefined) => ['driver', 'trip', tripIndex] as const

function fetchTrip(engine: SyncEngine | null, tripIndex: number) {
  return withSnapshot(engine, `trip:${tripIndex}`, () => read<DriverTripDetail>(
    () => api.GET('/api/v1/driver/trips/{tripIndex}', { params: { path: { tripIndex } } }), 'The trip could not be loaded.'))
}

function pendingView(engine: SyncEngine | null) {
  return { actions: engine?.pendingActions() ?? [], uploads: engine?.pendingUploads() ?? [] }
}

export function useDriverHome() {
  const { engine, status } = useFieldSync()
  const cache = useQueryClient()
  const query = useQuery({
    queryKey: ['driver', 'home'],
    retry: false, networkMode: 'always',
    refetchInterval: 30_000,
    queryFn: async () => {
      const home = await withSnapshot(engine, 'home', () => read<DriverHome>(() => api.GET('/api/v1/driver/home'), "Today's trips could not be loaded."))
      // Keep every trip of the day on the phone, so it can be worked on without a connection.
      if (!(home as Snapshotted<DriverHome>).__fromCache)
        await Promise.all(home.trips.map(t => cache.fetchQuery({ queryKey: tripKey(t.tripIndex), queryFn: () => fetchTrip(engine, t.tripIndex), networkMode: 'always' }).catch(() => undefined)))
      return home
    },
  })
  const tripData = useQueries({ queries: (query.data?.trips ?? []).map(t => ({ queryKey: tripKey(t.tripIndex), queryFn: () => fetchTrip(engine, t.tripIndex), retry: false, networkMode: 'always' as const })),
    combine: results => results.map(r => r.data) })
  const data = useMemo(() => {
    if (!query.data) return undefined
    const { actions, uploads } = pendingView(engine)
    const projected: Record<number, DriverTripDetail> = {}
    for (const trip of tripData) if (trip) projected[trip.card.tripIndex] = projectTrip(trip, actions, uploads)
    return projectHome(query.data, actions, projected)
    // status.version: recompute when the outbox changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, engine, status.version, tripData])
  return { ...query, data, fromCache: Boolean((query.data as Snapshotted<DriverHome> | undefined)?.__fromCache) } as typeof query & { fromCache: boolean }
}

export function useDriverTrip(tripIndex: number | undefined) {
  const { engine, status } = useFieldSync()
  const query = useQuery({
    queryKey: tripKey(tripIndex),
    enabled: tripIndex !== undefined && tripIndex > 0,
    retry: false, networkMode: 'always',
    refetchInterval: 30_000,
    queryFn: () => fetchTrip(engine, tripIndex!),
  })
  const data = useMemo(() => {
    if (!query.data) return undefined
    const { actions, uploads } = pendingView(engine)
    return projectTrip(query.data, actions, uploads)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, engine, status.version])
  return { ...query, data, fromCache: Boolean((query.data as Snapshotted<DriverTripDetail> | undefined)?.__fromCache) } as typeof query & { fromCache: boolean }
}

export function useDriverDeliveries() {
  const { engine, status } = useFieldSync()
  const query = useQuery({
    queryKey: ['driver', 'deliveries'],
    retry: false, networkMode: 'always',
    refetchInterval: 30_000,
    queryFn: () => withSnapshot(engine, 'deliveries', () => read<DriverDeliveries>(() => api.GET('/api/v1/driver/deliveries'), "Today's deliveries could not be loaded.")),
  })
  const indexes = [...new Set((query.data?.rows ?? []).map(r => r.tripIndex))]
  const tripData = useQueries({ queries: indexes.map(i => ({ queryKey: tripKey(i), queryFn: () => fetchTrip(engine, i), retry: false, networkMode: 'always' as const })),
    combine: results => results.map(r => r.data) })
  const data = useMemo(() => {
    if (!query.data) return undefined
    const { actions, uploads } = pendingView(engine)
    const projected: Record<number, DriverTripDetail> = {}
    for (const trip of tripData) if (trip) projected[trip.card.tripIndex] = projectTrip(trip, actions, uploads)
    return { ...query.data, rows: projectRows(query.data.rows, projected) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, engine, status.version, tripData])
  return { ...query, data } as typeof query
}

export function usePastTrips(enabled: boolean) {
  const { engine } = useFieldSync()
  return useQuery({
    queryKey: ['driver', 'past-trips'],
    enabled,
    retry: false, networkMode: 'always',
    queryFn: () => withSnapshot(engine, 'past-trips', () => read<DriverPastTrip[]>(() => api.GET('/api/v1/driver/past-trips'), 'Past trips could not be loaded.')),
  })
}

export function useDriverOrder(orderId: number | undefined) {
  const { engine } = useFieldSync()
  return useQuery({
    queryKey: ['driver', 'order', orderId],
    enabled: orderId !== undefined && orderId > 0,
    retry: false, networkMode: 'always',
    queryFn: () => withSnapshot(engine, `order:${orderId}`, () => read<DriverOrderDetail>(
      () => api.GET('/api/v1/driver/orders/{orderId}', { params: { path: { orderId: orderId! } } }), 'The delivery record could not be loaded.')),
  })
}

export function useDriverCapabilities() {
  const { engine } = useFieldSync()
  return useQuery({
    queryKey: ['driver', 'capabilities'],
    retry: false, networkMode: 'always',
    staleTime: 5 * 60_000,
    queryFn: () => withSnapshot(engine, 'capabilities', () => read<DriverCapabilities>(() => api.GET('/api/v1/driver/capabilities'), 'Capabilities could not be loaded.')),
  })
}

export type DriverAction =
  | { kind: 'start'; label?: string }
  | { kind: 'arrive'; outletId: string; label?: string }
  | { kind: 'outcome'; orderId: number; body: OutcomeBody; label?: string }
  | { kind: 'depart'; outletId: string; label?: string }
  | { kind: 'complete'; label?: string }

/** A field action the server refused when it was synced (shown under the button, kept on the sync screen). */
export class FieldActionError extends Error {
  readonly code?: string | null
  constructor(message: string, code?: string | null) { super(message); this.code = code }
}

/**
 * Every driver action is saved in the phone's outbox first, then synced. Online, the server's answer
 * arrives within the same call (a refusal is shown); offline, the action is kept and the screen shows
 * it at once through the local projection. Resolves with the trip as the driver now sees it.
 */
export function useDriverAction(card: Pick<DriverTripCard, 'tripIndex' | 'planDate' | 'planVersion'> | undefined) {
  const cache = useQueryClient()
  const { engine } = useFieldSync()
  return useMutation({
    retry: false, networkMode: 'always',
    mutationFn: async (action: DriverAction) => {
      if (!engine || !card) throw new Error('The trip has not loaded yet.')
      const base = { planDate: card.planDate, tripIndex: card.tripIndex, planVersion: card.planVersion }
      const b = action.kind === 'outcome' ? action.body : undefined
      const input: ActionInput = action.kind === 'start' ? { ...base, actionType: 'TRIP_START' }
        : action.kind === 'arrive' ? { ...base, actionType: 'STOP_ARRIVE', outletId: action.outletId }
        : action.kind === 'outcome' && b ? { ...base, actionType: 'ORDER_OUTCOME', orderId: action.orderId, outcome: b.outcome as Outcome,
            deliveredUnits: b.deliveredUnits, issueKind: b.issueKind, recipientName: b.recipientName, notes: b.notes, proofUploadIds: b.proofUploadIds }
        : action.kind === 'depart' ? { ...base, actionType: 'STOP_DEPART', outletId: action.outletId }
        : { ...base, actionType: 'TRIP_COMPLETE' }
      const label = action.label ?? defaultLabel(action, card.tripIndex)
      const { report } = await engine.enqueueAction(input, label, { awaitResult: true })
      const answer = await report
      if (answer.state === 'settled' && (answer.result === 'CONFLICT' || answer.result === 'REJECTED'))
        throw new FieldActionError(answer.message || 'The server did not accept this action.', answer.code)
      // Applied on the server: refresh the server copy. Queued: the projection already shows it.
      const raw = answer.state === 'settled'
        ? await cache.fetchQuery({ queryKey: tripKey(card.tripIndex), queryFn: () => fetchTrip(engine, card.tripIndex), staleTime: 0, networkMode: 'always' })
        : cache.getQueryData<DriverTripDetail>(tripKey(card.tripIndex))
      if (!raw) throw new Error('The trip has not loaded yet.')
      return { detail: projectTrip(raw, engine.pendingActions(), engine.pendingUploads()), queued: answer.state === 'queued', review: answer.state === 'settled' ? answer.review : null }
    },
    onSettled: () => {
      void cache.invalidateQueries({ queryKey: ['driver', 'home'] })
      void cache.invalidateQueries({ queryKey: ['driver', 'deliveries'] })
      void cache.invalidateQueries({ queryKey: ['driver', 'order'] })
    },
  })
}

function defaultLabel(action: DriverAction, tripIndex: number) {
  switch (action.kind) {
    case 'start': return `Trip ${tripIndex} started`
    case 'arrive': return `Arrived at ${action.outletId}`
    case 'outcome': return `Order ${action.orderId}: ${OUTCOME_LABELS[action.body.outcome] ?? action.body.outcome}`
    case 'depart': return `Left ${action.outletId}`
    case 'complete': return `Trip ${tripIndex} finished`
  }
}

/**
 * Proof photos are compressed on the phone before they are saved (longest side 1280 px, JPEG quality
 * 0.7), so they travel over a weak connection; signatures stay PNG. The server checks and re-encodes again.
 */
export async function compressPhoto(file: Blob, maxSide = 1280, quality = 0.7): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return file
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  return await new Promise<Blob>((resolve) => canvas.toBlob(blob => resolve(blob ?? file), 'image/jpeg', quality))
}

/** Saves a proof file in the outbox (uploaded before the outcome that references it); resolves with its client id. */
export function useUploadProof(card: Pick<DriverTripCard, 'tripIndex' | 'planDate'>, orderId: number, orderRef: string) {
  const { engine } = useFieldSync()
  return useMutation({
    retry: false, networkMode: 'always',
    mutationFn: async ({ kind, file }: { kind: 'PHOTO' | 'SIGNATURE'; file: Blob }) => {
      if (!engine) throw new Error('Not signed in.')
      return engine.enqueueUpload({ planDate: card.planDate, tripIndex: card.tripIndex, orderId, kind, blob: file },
        `${orderRef} ${kind === 'PHOTO' ? 'photo' : 'signature'}`)
    },
  })
}

/** Whether the browser currently has a network connection. */
export function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

export const ISSUE_LABELS: Record<string, string> = {
  CUSTOMER_UNAVAILABLE: 'Customer unavailable', MISSING: 'Missing item', DAMAGED: 'Damaged item',
  WRONG_ITEM: 'Wrong item', REFUSED: 'Delivery refused', OTHER: 'Other',
}

export const OUTCOME_LABELS: Record<string, string> = { DELIVERED: 'Delivered', PARTIAL: 'Partially delivered', FAILED: 'Failed delivery' }

export function clock(value?: string | null) {
  return value ? value.slice(0, 5) : '—'
}

/** An instant (ISO) shown as Colombo wall-clock time. */
export function timeOf(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Colombo' }).format(new Date(value))
}

export function dayOf(value?: string | null) {
  if (!value) return ''
  const date = value.length <= 10 ? new Date(`${value}T00:00:00Z`) : new Date(value)
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: value.length <= 10 ? 'UTC' : 'Asia/Colombo' }).format(date)
}

export function num(value: number | null | undefined, digits = 0) {
  return value == null ? '—' : Number(value).toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

export function minutes(total: number | null | undefined) {
  if (total == null) return '—'
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}
