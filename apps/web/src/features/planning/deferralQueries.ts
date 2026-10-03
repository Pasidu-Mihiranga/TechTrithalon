import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiReadError } from '../../lib/apiClient'
import type { components } from '../../generated/api'

export type DeferralRecord = components['schemas']['DeferralRecord']

/** Published deferrals for one run, with totals computed by the server. */
export function useDeferralRun(date: string | undefined, depot?: string) {
  return useQuery({
    queryKey: ['dispatcher', 'deferrals', date, depot],
    enabled: Boolean(date),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/dispatcher/deferrals', { params: { query: { date: date!, depot } } })
      if (error || !data) throw apiReadError(response, 'Deferred orders could not be loaded')
      return data
    },
    retry: false,
  })
}

/** Repeat-skip evidence for specific orders; works before any candidate plan exists. */
export function useOrderFairness(date: string | undefined, orderIds: number[]) {
  return useQuery({
    queryKey: ['dispatcher', 'deferrals', 'fairness', date, [...orderIds].sort((a, b) => a - b)],
    enabled: Boolean(date) && orderIds.length > 0,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/dispatcher/deferrals/fairness', { params: { query: { date: date!, orderIds } } })
      if (error || !data) throw apiReadError(response, 'Repeat-skip history could not be loaded')
      return data
    },
    retry: false,
  })
}

/** Deferral notices for the signed-in store manager's outlet. */
export function useStoreDeferrals() {
  return useQuery({
    queryKey: ['store', 'deferrals'],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/store/deferrals')
      if (error || !data) throw apiReadError(response, 'Deferral notices could not be loaded')
      return data
    },
    retry: false,
  })
}

export function useAcknowledgeDeferral() {
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async (id: number) => {
      const { data, error, response } = await api.POST('/api/v1/store/deferrals/{id}/acknowledge', { params: { path: { id } } })
      if (error || !data) throw apiReadError(response, 'The notice could not be acknowledged')
      return data
    },
    onSuccess: () => { void cache.invalidateQueries({ queryKey: ['store', 'deferrals'] }) },
  })
}
