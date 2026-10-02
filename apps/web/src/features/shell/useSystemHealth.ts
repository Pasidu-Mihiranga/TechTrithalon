import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/apiClient'

export const systemHealthKey = ['system', 'health'] as const

export function useSystemHealth() {
  return useQuery({
    queryKey: systemHealthKey,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/system/health')
      if (error || !data) throw new Error('The API did not return a health response')
      return data
    },
    retry: false,
    refetchInterval: 30_000,
  })
}
