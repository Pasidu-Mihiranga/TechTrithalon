import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/apiClient'
import type { components } from '../../generated/api'

type Schema = components['schemas']
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
export type OutcomeBody = Omit<Schema['DriverOutcomeRequest'], 'expectedVersion'>
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

export function useDriverHome() {
  return useQuery({
    queryKey: ['driver', 'home'],
    retry: false,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/driver/home')
      if (!data) throw new DriverRequestError(response, error, "Today's trips could not be loaded.")
      return data as DriverHome
    },
  })
}

export function useDriverTrip(tripIndex: number | undefined) {
  return useQuery({
    queryKey: ['driver', 'trip', tripIndex],
    enabled: tripIndex !== undefined && tripIndex > 0,
    retry: false,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/driver/trips/{tripIndex}', { params: { path: { tripIndex: tripIndex! } } })
      if (!data) throw new DriverRequestError(response, error, 'The trip could not be loaded.')
      return data as DriverTripDetail
    },
  })
}

export function useDriverDeliveries() {
  return useQuery({
    queryKey: ['driver', 'deliveries'],
    retry: false,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/driver/deliveries')
      if (!data) throw new DriverRequestError(response, error, "Today's deliveries could not be loaded.")
      return data as DriverDeliveries
    },
  })
}

export function usePastTrips(enabled: boolean) {
  return useQuery({
    queryKey: ['driver', 'past-trips'],
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/driver/past-trips')
      if (!data) throw new DriverRequestError(response, error, 'Past trips could not be loaded.')
      return data as DriverPastTrip[]
    },
  })
}

export function useDriverOrder(orderId: number | undefined) {
  return useQuery({
    queryKey: ['driver', 'order', orderId],
    enabled: orderId !== undefined && orderId > 0,
    retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/driver/orders/{orderId}', { params: { path: { orderId: orderId! } } })
      if (!data) throw new DriverRequestError(response, error, 'The delivery record could not be loaded.')
      return data as DriverOrderDetail
    },
  })
}

export function useDriverCapabilities() {
  return useQuery({
    queryKey: ['driver', 'capabilities'],
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/driver/capabilities')
      if (!data) throw new DriverRequestError(response, error)
      return data as DriverCapabilities
    },
  })
}

export type DriverAction =
  | { kind: 'start'; planVersion: number }
  | { kind: 'arrive'; outletId: string }
  | { kind: 'outcome'; orderId: number; body: OutcomeBody }
  | { kind: 'depart'; outletId: string }
  | { kind: 'complete' }

/** Every action after the start sends the displayed trip version; a 409 is shown and the trip reloaded, never retried. */
export function useDriverAction(tripIndex: number, version: number | null | undefined) {
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async (action: DriverAction) => {
      const trip = { tripIndex }
      if (action.kind !== 'start' && (version === undefined || version === null)) throw new Error('The trip has not started yet.')
      const expectedVersion = version ?? 0
      let result
      switch (action.kind) {
        case 'start':
          result = await api.POST('/api/v1/driver/trips/{tripIndex}/start', { params: { path: trip }, body: { planVersion: action.planVersion } }); break
        case 'arrive':
          result = await api.POST('/api/v1/driver/trips/{tripIndex}/stops/{outletId}/arrive',
            { params: { path: { ...trip, outletId: action.outletId } }, body: { expectedVersion } }); break
        case 'outcome':
          result = await api.POST('/api/v1/driver/trips/{tripIndex}/orders/{orderId}/outcome',
            { params: { path: { ...trip, orderId: action.orderId } }, body: { ...action.body, expectedVersion } }); break
        case 'depart':
          result = await api.POST('/api/v1/driver/trips/{tripIndex}/stops/{outletId}/depart',
            { params: { path: { ...trip, outletId: action.outletId } }, body: { expectedVersion } }); break
        case 'complete':
          result = await api.POST('/api/v1/driver/trips/{tripIndex}/complete', { params: { path: trip }, body: { expectedVersion } }); break
      }
      if (!result.data) throw new DriverRequestError(result.response, result.error)
      return result.data as DriverTripDetail
    },
    onSuccess: (detail) => {
      cache.setQueryData(['driver', 'trip', tripIndex], detail)
      void cache.invalidateQueries({ queryKey: ['driver', 'home'] })
      void cache.invalidateQueries({ queryKey: ['driver', 'deliveries'] })
      void cache.invalidateQueries({ queryKey: ['driver', 'order'] })
    },
    onError: (failure) => {
      if (failure instanceof DriverRequestError && failure.status === 409) void cache.invalidateQueries({ queryKey: ['driver', 'trip', tripIndex] })
    },
  })
}

/**
 * Proof photos are compressed on the phone before upload (longest side 1280 px, JPEG quality 0.7),
 * so they travel over a weak connection; signatures stay PNG. The server checks and re-encodes again.
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

export function useUploadProof(tripIndex: number, orderId: number) {
  return useMutation({
    retry: false,
    mutationFn: async ({ kind, file }: { kind: 'PHOTO' | 'SIGNATURE'; file: Blob }) => {
      const form = new FormData()
      form.append('file', file, kind === 'PHOTO' ? 'proof.jpg' : 'signature.png')
      const { data, error, response } = await api.POST('/api/v1/driver/trips/{tripIndex}/orders/{orderId}/proofs', {
        params: { path: { tripIndex, orderId }, query: { kind } },
        body: form as never,
        bodySerializer: (body: unknown) => body as FormData,
      })
      if (!data) throw new DriverRequestError(response, error, 'The file could not be uploaded.')
      return data as Present<Schema['DriverPodUpload']>
    },
  })
}

/** Whether the browser currently has a network connection (shown in the header; offline sync is a later step). */
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
