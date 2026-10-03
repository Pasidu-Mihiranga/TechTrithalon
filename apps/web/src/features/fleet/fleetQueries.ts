import { useQuery } from '@tanstack/react-query'
import { api, apiReadError } from '../../lib/apiClient'
import type { components } from '../../generated/api'

type Present<T> = T extends (infer U)[] ? Present<U>[]
  : T extends object ? { [K in keyof T]-?: Present<NonNullable<T[K]>> | Extract<T[K], null> } : T
type FleetOverview = Present<components['schemas']['FleetOverview']>

export function useFleet(date?: string, depot?: string) {
  return useQuery({
    queryKey: ['dispatcher', 'fleet', date ?? 'demo', depot],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/dispatcher/fleet', {
        params: { query: { date, depot } },
      })
      if (error || !data) throw apiReadError(response, 'Fleet data could not be loaded')
      return data
    },
    retry: false,
  })
}

/** Server-computed depot counts and the matching vehicle rows for one delivery day. */
export function useFleetOverview(date?: string, depot?: string) {
  return useQuery({
    queryKey: ['dispatcher', 'fleet-overview', date ?? 'demo', depot],
    enabled: Boolean(depot),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/dispatcher/fleet/overview', {
        params: { query: { date, depot: depot! } },
      })
      if (error || !data) throw apiReadError(response, 'Fleet overview could not be loaded')
      return data as FleetOverview
    },
    retry: false,
    refetchInterval: 15_000,
  })
}

export function useFleetVehicle(vehicleId: string, date?: string) {
  return useQuery({
    queryKey: ['dispatcher', 'fleet', vehicleId, date ?? 'demo'],
    enabled: Boolean(vehicleId),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/dispatcher/fleet/{vehicleId}', {
        params: { path: { vehicleId }, query: date ? { date } : {} },
      })
      if (error || !data) throw apiReadError(response, 'Vehicle could not be loaded')
      return data
    },
    retry: false,
  })
}
