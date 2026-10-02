import { useQuery } from '@tanstack/react-query'
import { api, apiReadError } from '../../lib/apiClient'

export function useDispatcherDashboard(date?: string) {
  return useQuery({
    queryKey: ['dispatcher', 'dashboard', date ?? 'demo'],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/dispatcher/dashboard', {
        params: { query: date ? { date } : {} },
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
