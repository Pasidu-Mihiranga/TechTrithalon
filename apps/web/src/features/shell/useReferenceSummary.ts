import { useQuery } from '@tanstack/react-query'
import { api, apiReadError } from '../../lib/apiClient'

export function useReferenceSummary() {
  return useQuery({
    queryKey: ['reference', 'summary'],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/reference/summary')
      if (error || !data) throw apiReadError(response, 'The API did not return reference data')
      return data
    },
    retry: false,
  })
}
