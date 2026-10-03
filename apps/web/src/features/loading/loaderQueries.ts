import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/apiClient'
import type { components } from '../../generated/api'

type Schema = components['schemas']
/**
 * The loader API always serialises every field (null when absent), but springdoc marks record fields
 * optional. This mirrors the actual responses: every key present, `null` kept where the schema allows it.
 */
type Present<T> = T extends (infer U)[] ? Present<U>[]
  : T extends object ? { [K in keyof T]-?: Present<NonNullable<T[K]>> | Extract<T[K], null> } : T
export type LoaderBoard = Present<Schema['LoaderBoard']>
export type LoaderTripCard = Present<Schema['LoaderTripCard']>
export type LoaderTaskDetail = Present<Schema['LoaderTaskDetail']>
export type LoaderStop = Present<Schema['LoaderStop']>
export type LoadLine = Present<Schema['LoadLine']>
export type LoadingIssue = Present<Schema['LoadingIssue']>
export type ShortfallKind = Schema['LoadShortfallRequest']['kind']

/** Keeps the server's code, trace id and recovery facts (current task, blockers) for the screens. */
export class LoaderRequestError extends Error {
  readonly status: number
  readonly code?: string
  readonly traceId?: string
  readonly currentTaskId?: number
  readonly blockers: string[]
  constructor(response: Response, payload: unknown) {
    const body = (payload && typeof payload === 'object' ? payload : {}) as {
      detail?: string; code?: string; traceId?: string; currentTaskId?: number; blockers?: string[]
    }
    super(body.detail || 'The loading request failed.')
    this.status = response.status
    this.code = body.code
    this.traceId = body.traceId
    this.currentTaskId = body.currentTaskId
    this.blockers = body.blockers ?? []
  }
}

export function useLoaderBoard() {
  return useQuery({
    queryKey: ['loader', 'board'],
    retry: false,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/loader/board')
      if (!data) throw new LoaderRequestError(response, error)
      return data as LoaderBoard
    },
  })
}

export function useLoadTask(id: number | undefined) {
  return useQuery({
    queryKey: ['loader', 'task', id],
    enabled: id !== undefined && id > 0,
    retry: false,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/loader/load-tasks/{id}', { params: { path: { id: id! } } })
      if (!data) throw new LoaderRequestError(response, error)
      return data as LoaderTaskDetail
    },
  })
}

export function useLoaderIssues(status?: 'OPEN' | 'RESOLVED') {
  return useQuery({
    queryKey: ['loader', 'issues', status ?? 'all'],
    retry: false,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/loader/issues', { params: { query: { status } } })
      if (!data) throw new LoaderRequestError(response, error)
      return data as LoadingIssue[]
    },
  })
}

export type LoaderAction =
  | { kind: 'acknowledge' }
  | { kind: 'confirmLine'; lineId: number }
  | { kind: 'shortfall'; lineId: number; body: Omit<Schema['LoadShortfallRequest'], 'expectedVersion'> }
  | { kind: 'markLoaded' }

/** Every action sends the displayed manifest version; a 409 is shown, never retried automatically. */
export function useLoaderAction(taskId: number, version: number | undefined) {
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async (action: LoaderAction) => {
      if (version === undefined) throw new Error('The manifest has not loaded yet.')
      const id = { path: { id: taskId } }
      let result
      switch (action.kind) {
        case 'acknowledge':
          result = await api.POST('/api/v1/loader/load-tasks/{id}/acknowledge', { params: id, body: { expectedVersion: version } }); break
        case 'confirmLine':
          result = await api.POST('/api/v1/loader/load-tasks/{id}/lines/{lineId}/loaded',
            { params: { path: { id: taskId, lineId: action.lineId } }, body: { expectedVersion: version } }); break
        case 'shortfall':
          result = await api.POST('/api/v1/loader/load-tasks/{id}/lines/{lineId}/shortfall',
            { params: { path: { id: taskId, lineId: action.lineId } }, body: { ...action.body, expectedVersion: version } }); break
        case 'markLoaded':
          result = await api.POST('/api/v1/loader/load-tasks/{id}/loaded', { params: id, body: { expectedVersion: version } }); break
      }
      if (!result.data) throw new LoaderRequestError(result.response, result.error)
      return result.data as LoaderTaskDetail
    },
    onSuccess: (detail) => {
      cache.setQueryData(['loader', 'task', taskId], detail)
      void cache.invalidateQueries({ queryKey: ['loader', 'board'] })
      void cache.invalidateQueries({ queryKey: ['loader', 'issues'] })
    },
    onError: (failure) => {
      // A stale or replaced manifest must be reloaded before anything else is recorded.
      if (failure instanceof LoaderRequestError && failure.status === 409) void cache.invalidateQueries({ queryKey: ['loader', 'task', taskId] })
    },
  })
}

/** Loader-facing status label for a trip, from server state only. */
export function tripBadge(card: LoaderTripCard): { label: string; tone: 'loading' | 'queued' | 'loaded' | 'held' | 'update' } {
  if (card.held) return { label: 'Vehicle held', tone: 'held' }
  if (card.awaitingAcknowledgement) return { label: `New manifest v${card.planVersion}`, tone: 'update' }
  if (card.status === 'loaded') return { label: 'Loaded', tone: 'loaded' }
  if (card.orders > 0 && card.ordersChecked === card.orders) return { label: 'Ready for handover', tone: 'loaded' }
  if (card.status === 'loading') return { label: `Loading · ${card.stopsLoaded} of ${card.stops}`, tone: 'loading' }
  return { label: 'Not started', tone: 'queued' }
}

export function clock(value?: string | null) {
  return value ? value.slice(0, 5) : '—'
}

export function num(value: number | null | undefined, digits = 1) {
  return value == null ? '—' : Number(value).toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

export const SHORTFALL_LABELS: Record<string, string> = { MISSING: 'Missing', DAMAGED: 'Damaged', WRONG_ITEM: 'Wrong item' }
