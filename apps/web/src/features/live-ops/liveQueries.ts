import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/apiClient'
import type { components } from '../../generated/api'

type Schema = components['schemas']
/** The API serialises every field (null when absent); springdoc marks record fields optional. */
type Present<T> = T extends (infer U)[] ? Present<U>[]
  : T extends object ? { [K in keyof T]-?: Present<NonNullable<T[K]>> | Extract<T[K], null> } : T
export type LiveBoard = Present<Schema['LiveBoard']>
export type LiveVehicle = Present<Schema['LiveVehicle']>
export type LiveState = 'LOADING' | 'READY' | 'IN_TRANSIT' | 'DELAYED' | 'COMPLETED'

export class LiveRequestError extends Error {
  readonly status: number
  readonly traceId?: string
  constructor(response: Response, payload: unknown, fallback: string) {
    const body = (payload && typeof payload === 'object' ? payload : {}) as { detail?: string; traceId?: string }
    super(body.detail || fallback)
    this.status = response.status
    this.traceId = body.traceId
  }
}

/** Where every published trip of the run stands. Polled every 15 s (server-sent events are a later upgrade). */
export function useLiveBoard(date: string | undefined, depot: string | undefined) {
  return useQuery({
    queryKey: ['dispatcher', 'live-operations', date, depot],
    enabled: Boolean(date && depot),
    retry: false,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/dispatcher/live-operations', { params: { query: { date, depot } } })
      if (!data) throw new LiveRequestError(response, error, 'The live board could not be loaded.')
      return data as LiveBoard
    },
  })
}

export const STATE_LABELS: Record<LiveState, string> = {
  LOADING: 'Loading', READY: 'Ready to leave', IN_TRANSIT: 'In Transit', DELAYED: 'Delayed', COMPLETED: 'Completed',
}

/** Delayed first, then trips on the road, then waiting, then finished. */
export const STATE_ORDER: Record<LiveState, number> = { DELAYED: 0, IN_TRANSIT: 1, READY: 2, LOADING: 3, COMPLETED: 4 }

export function lastUpdate(minutes: number) {
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`
}

export function stamp(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Colombo' }).format(new Date(value))
}

export function clock(value?: string | null) { return value ? value.slice(0, 5) : '—' }
