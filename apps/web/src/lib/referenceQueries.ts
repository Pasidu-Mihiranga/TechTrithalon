import { useQuery } from '@tanstack/react-query'
import { api } from './apiClient'

function readError(response: Response): Error {
  return new Error(response.status === 403 ? 'Your role cannot access this reference data.'
    : response.status === 401 ? 'Sign in to load reference data.' : 'Reference data could not be loaded. Try again.')
}

export function useOutlets() {
  return useQuery({
    queryKey: ['reference', 'outlets'],
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/reference/outlets')
      if (!response.ok || !data) throw readError(response)
      return data
    },
    retry: false,
  })
}

export function useVehicles() {
  return useQuery({
    queryKey: ['reference', 'vehicles'],
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/reference/vehicles')
      if (!response.ok || !data) throw readError(response)
      return data
    },
    retry: false,
  })
}

export type Geography = import('../generated/api').components['schemas']['GeographyView']

/** Public district boundaries, town-level depot points and district travel figures (no outlet locations). */
export function useGeography() {
  return useQuery({
    queryKey: ['reference', 'geography'],
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/reference/geography')
      if (!response.ok || !data) throw readError(response)
      return data
    },
    retry: false,
    staleTime: 60 * 60 * 1000,
  })
}
