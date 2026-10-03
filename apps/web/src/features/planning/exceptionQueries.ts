import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/apiClient'
import type { components } from '../../generated/api'

type Schema = components['schemas']
/** The API serialises every field (null when absent); springdoc marks record fields optional. */
type Present<T> = T extends (infer U)[] ? Present<U>[]
  : T extends object ? { [K in keyof T]-?: Present<NonNullable<T[K]>> | Extract<T[K], null> } : T
export type ExceptionQueue = Present<Schema['ExceptionQueue']>
export type ExceptionItem = Present<Schema['ExceptionItem']>
export type ExceptionStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'

/** Keeps the server's code and message for the screens. */
export class ExceptionRequestError extends Error {
  readonly status: number
  readonly code?: string
  readonly traceId?: string
  constructor(response: Response, payload: unknown, fallback = 'The request failed.') {
    const body = (payload && typeof payload === 'object' ? payload : {}) as { detail?: string; code?: string; traceId?: string }
    super(body.detail || fallback)
    this.status = response.status
    this.code = body.code
    this.traceId = body.traceId
  }
}

/** The queue for one day and depot. Polled: the dispatcher's board follows what drivers and stores do. */
export function useExceptionQueue(date: string | undefined, depot: string | undefined) {
  return useQuery({
    queryKey: ['dispatcher', 'exceptions', date, depot],
    enabled: Boolean(date && depot),
    retry: false,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/dispatcher/exceptions', { params: { query: { date, depot } } })
      if (!data) throw new ExceptionRequestError(response, error, 'Exceptions could not be loaded.')
      return data as ExceptionQueue
    },
  })
}

export function useClaimException(date: string | undefined, depot: string | undefined) {
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async (item: ExceptionItem) => {
      const { data, error, response } = await api.POST('/api/v1/dispatcher/exceptions/{type}/{id}/claim',
        { params: { path: { type: item.sourceType, id: item.sourceId }, query: { date, depot } } })
      if (!data) throw new ExceptionRequestError(response, error)
      return data as ExceptionItem
    },
    onSettled: () => { void cache.invalidateQueries({ queryKey: ['dispatcher', 'exceptions'] }) },
  })
}

export function useResolveException(date: string | undefined, depot: string | undefined) {
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async (input: { item: ExceptionItem; decision?: string; note: string }) => {
      const { data, error, response } = await api.POST('/api/v1/dispatcher/exceptions/{type}/{id}/resolve', {
        params: { path: { type: input.item.sourceType, id: input.item.sourceId }, query: { date, depot } },
        body: { expectedVersion: input.item.version, decision: input.decision, note: input.note },
      })
      if (!data) throw new ExceptionRequestError(response, error)
      return data as ExceptionItem
    },
    onSettled: () => {
      void cache.invalidateQueries({ queryKey: ['dispatcher', 'exceptions'] })
      void cache.invalidateQueries({ queryKey: ['dispatcher', 'receipt-discrepancies'] })
      void cache.invalidateQueries({ queryKey: ['dispatcher', 'dashboard'] })
    },
  })
}

export const STATUS_LABELS: Record<ExceptionStatus, string> = { OPEN: 'Open', IN_PROGRESS: 'In Progress', RESOLVED: 'Resolved' }

export const KIND_LABELS: Record<string, string> = {
  LOADING_SHORTFALL: 'Loading shortfall',
  RECEIPT_DISPUTE: 'Store dispute',
  DELIVERY_PARTIAL: 'Partial delivery',
  DELIVERY_FAILED: 'Delivery failed',
  DELIVERY_REVIEW: 'Delivery needs review',
  SYNC_CONFLICT: 'Phone action conflicted',
  SYNC_REJECTED: 'Phone action rejected',
  ROUTE_CHANGED_OFFLINE: 'Route changed offline',
  STOP_NOT_ON_TRIP: 'Stop not on the trip',
}

export const DECISION_LABELS: Record<string, string> = {
  SEND_SHORT: 'Send short',
  REPLANNED: 'Handled by a new plan',
  CREDIT: 'Credit the store',
  REPLACEMENT: 'Send a replacement',
  NO_ACTION: 'No action',
}

/** "2 min ago", measured against the server's snapshot time so it never disagrees with the demo clock. */
export function ago(value: string, asOf: string) {
  const minutes = Math.max(0, Math.floor((new Date(asOf).getTime() - new Date(value).getTime()) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ${minutes % 60} min ago`
  return `${Math.floor(hours / 24)} d ago`
}

/** A short Colombo date and time, for example "25 Jun, 16:30". */
export function stamp(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Colombo' }).format(new Date(value))
}
