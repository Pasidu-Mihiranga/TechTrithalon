import { useQuery } from '@tanstack/react-query'
import { api, apiReadError } from '../../lib/apiClient'

/** Read every selected ID; a table page is never the complete selection. */
export async function loadSelectedPlanningOrders(ids: number[], date: string, depot: string) {
  return Promise.all(ids.map(async id => {
    const { data, error, response } = await api.GET('/api/v1/dispatcher/orders/{id}', { params: { path: { id } } })
    if (error || !data) throw apiReadError(response, 'Selected orders could not be exported')
    if (data.planningDate !== date || data.depot !== depot || (data.status !== 'confirmed' && data.status !== 'deferred')) {
      throw new Error('A selected order is no longer eligible in this planning scope. Refresh the queue before exporting.')
    }
    return data
  }))
}

export function useDispatcherDashboard(date?: string, depot?: string) {
  return useQuery({
    queryKey: ['dispatcher', 'dashboard', date ?? 'demo', depot],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/dispatcher/dashboard', {
        params: { query: { date, depot } },
      })
      if (error || !data) throw apiReadError(response, 'Dashboard data could not be loaded')
      return data
    },
    retry: false,
  })
}

export function useDispatcherOrders(query: {
  date?: string
  depot?: string
  brand?: string
  tempRequirement?: string
  parkingConstraint?: string
  status?: string
  q?: string
  sort?: string
  asc?: boolean
  page?: number
  size?: number
}) {
  return useQuery({
    queryKey: ['dispatcher', 'orders', query],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/dispatcher/orders', {
        params: {
          query: {
            date: query.date,
            depot: query.depot,
            brand: query.brand || undefined,
            tempRequirement: query.tempRequirement || undefined,
            parkingConstraint: query.parkingConstraint || undefined,
            status: query.status || undefined,
            q: query.q || undefined,
            sort: query.sort ?? 'ref',
            asc: query.asc ?? true,
            page: query.page ?? 0,
            size: query.size ?? 50,
          },
        },
      })
      if (error || !data) throw apiReadError(response, 'Orders could not be loaded')
      return data
    },
    retry: false,
  })
}

export function useDispatcherOrder(id: number) {
  return useQuery({
    queryKey: ['dispatcher', 'orders', id],
    enabled: Number.isFinite(id) && id > 0,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/dispatcher/orders/{id}', {
        params: { path: { id } },
      })
      if (error || !data) throw apiReadError(response, 'Order could not be loaded')
      return data
    },
    retry: false,
  })
}

export function useStoreCutoff() {
  return useQuery({
    queryKey: ['store', 'cutoff'],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/store/cutoff')
      if (error || !data) throw apiReadError(response, 'Cutoff could not be loaded')
      return data
    },
    retry: false,
    refetchInterval: 30_000,
  })
}

export function useStoreOrders(query: {
  date?: string
  status?: string
  q?: string
  sort?: string
  asc?: boolean
  page?: number
  size?: number
}) {
  return useQuery({
    queryKey: ['store', 'orders', query],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/store/orders', {
        params: {
          query: {
            date: query.date,
            status: query.status || undefined,
            q: query.q || undefined,
            sort: query.sort ?? 'orderDate',
            asc: query.asc ?? false,
            page: query.page ?? 0,
            size: query.size ?? 50,
          },
        },
      })
      if (error || !data) throw apiReadError(response, 'Your orders could not be loaded')
      return data
    },
    retry: false,
  })
}

export function useStoreOrder(id: number) {
  return useQuery({
    queryKey: ['store', 'orders', id],
    enabled: Number.isFinite(id) && id > 0,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/store/orders/{id}', {
        params: { path: { id } },
      })
      if (error || !data) throw apiReadError(response, 'Order could not be loaded')
      return data
    },
    retry: false,
  })
}

export function usePlanningQueueSummary(date: string, depot: string) {
  return useQuery({
    queryKey: ['dispatcher', 'orders', 'summary', date, depot],
    enabled: Boolean(date && depot), retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/dispatcher/orders/summary', {
        params: { query: { date, depot } },
      })
      if (error || !data) throw apiReadError(response, 'Planning queue totals could not be loaded')
      return data
    },
  })
}

/** The planning queue grouped by district, computed by the server for the exact date and depot. */
export function useDistrictDemand(date?: string, depot?: string) {
  return useQuery({
    queryKey: ['dispatcher', 'orders', 'districts', date, depot],
    enabled: Boolean(date && depot),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/dispatcher/orders/districts', { params: { query: { date, depot } } })
      if (error || !data) throw apiReadError(response, 'District demand could not be loaded')
      return data
    },
    retry: false,
  })
}
