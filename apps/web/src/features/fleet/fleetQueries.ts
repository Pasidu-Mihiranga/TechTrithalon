import { useQuery } from '@tanstack/react-query'
import { api, apiReadError } from '../../lib/apiClient'

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
