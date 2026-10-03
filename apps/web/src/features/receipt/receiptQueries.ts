import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/apiClient'
import type { components } from '../../generated/api'

type Schema = components['schemas']
/** The API serialises every field (null when absent); springdoc marks record fields optional. */
type Present<T> = T extends (infer U)[] ? Present<U>[]
  : T extends object ? { [K in keyof T]-?: Present<NonNullable<T[K]>> | Extract<T[K], null> } : T
export type DeliveryRow = Present<Schema['ReceiptDeliveryRow']>
export type DeliveryDetail = Present<Schema['ReceiptDeliveryDetail']>
export type Discrepancy = Present<Schema['ReceiptDiscrepancy']>
export type DisputeKind = Schema['ReceiptDisputeRequest']['kind']
export type Decision = Schema['ReceiptDecisionRequest']['decision']
export type Phase = 'PENDING' | 'IN_DELIVERY' | 'DELIVERED'

/** Keeps the server's code and message for the screens. */
export class ReceiptRequestError extends Error {
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

export function useStoreDeliveries() {
  return useQuery({
    queryKey: ['store', 'deliveries'],
    retry: false,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/store/deliveries')
      if (!data) throw new ReceiptRequestError(response, error, 'Deliveries could not be loaded.')
      return data.rows as DeliveryRow[]
    },
  })
}

export function useStoreDelivery(orderId: number | undefined) {
  return useQuery({
    queryKey: ['store', 'delivery', orderId],
    enabled: orderId !== undefined && orderId > 0,
    retry: false,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/store/deliveries/{orderId}', { params: { path: { orderId: orderId! } } })
      if (!data) throw new ReceiptRequestError(response, error, 'The delivery could not be loaded.')
      return data as DeliveryDetail
    },
  })
}

export function useStoreIssues() {
  return useQuery({
    queryKey: ['store', 'issues'],
    retry: false,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/store/issues')
      if (!data) throw new ReceiptRequestError(response, error, 'Issues could not be loaded.')
      return data as Discrepancy[]
    },
  })
}

function refreshStore(cache: ReturnType<typeof useQueryClient>, detail: DeliveryDetail) {
  cache.setQueryData(['store', 'delivery', detail.row.orderId], detail)
  void cache.invalidateQueries({ queryKey: ['store', 'deliveries'] })
  void cache.invalidateQueries({ queryKey: ['store', 'issues'] })
  void cache.invalidateQueries({ queryKey: ['store', 'orders'] })
}

export function useConfirmReceipt(orderId: number) {
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async () => {
      const { data, error, response } = await api.POST('/api/v1/store/deliveries/{orderId}/receipt', { params: { path: { orderId } } })
      if (!data) throw new ReceiptRequestError(response, error)
      return data as DeliveryDetail
    },
    onSuccess: detail => refreshStore(cache, detail),
    onError: () => { void cache.invalidateQueries({ queryKey: ['store', 'delivery', orderId] }) },
  })
}

export function useReportIssue(orderId: number) {
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async (body: Schema['ReceiptDisputeRequest']) => {
      const { data, error, response } = await api.POST('/api/v1/store/deliveries/{orderId}/issue', { params: { path: { orderId } }, body })
      if (!data) throw new ReceiptRequestError(response, error)
      return data as DeliveryDetail
    },
    onSuccess: detail => refreshStore(cache, detail),
    onError: () => { void cache.invalidateQueries({ queryKey: ['store', 'delivery', orderId] }) },
  })
}

export function useReceiptDiscrepancies(depot: string | undefined) {
  return useQuery({
    queryKey: ['dispatcher', 'receipt-discrepancies', depot],
    retry: false,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/dispatcher/receipt-discrepancies', { params: { query: { depot } } })
      if (!data) throw new ReceiptRequestError(response, error, 'Receipt issues could not be loaded.')
      return data as Discrepancy[]
    },
  })
}

export function useResolveDiscrepancy() {
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async (input: { id: number; version: number; decision: Decision; note: string }) => {
      const { data, error, response } = await api.POST('/api/v1/dispatcher/receipt-discrepancies/{id}/resolve',
        { params: { path: { id: input.id } }, body: { expectedVersion: input.version, decision: input.decision, note: input.note } })
      if (!data) throw new ReceiptRequestError(response, error)
      return data as Discrepancy
    },
    onSettled: () => { void cache.invalidateQueries({ queryKey: ['dispatcher', 'receipt-discrepancies'] }) },
  })
}

export const KIND_LABELS: Record<string, string> = { SHORT: 'Short', DAMAGED: 'Damaged', WRONG_ITEM: 'Wrong item', OTHER: 'Other' }
export const DECISION_LABELS: Record<string, string> = { CREDIT: 'Credit the store', REPLACEMENT: 'Send a replacement', NO_ACTION: 'No action' }
export const OUTCOME_LABELS: Record<string, string> = { DELIVERED: 'Delivered', PARTIAL: 'Partially delivered', FAILED: 'Not delivered' }

export function clock(value?: string | null) { return value ? value.slice(0, 5) : '—' }

export function when(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Colombo' }).format(new Date(value))
}

/** A short Colombo date and time, for example "25 Jun, 16:30". Absolute, so it never disagrees with the server's clock. */
export function stamp(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Colombo' }).format(new Date(value))
}
