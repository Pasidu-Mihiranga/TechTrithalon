import createClient from 'openapi-fetch'
import type { paths } from '../generated/api'
import { apiBaseUrl } from './config'

/** Build a typed client. Types come from apps/api/openapi.json. */
export function createApiClient(baseUrl: string, fetchImpl?: typeof fetch) {
  return createClient<paths>({ baseUrl, ...(fetchImpl ? { fetch: fetchImpl } : {}) })
}

/** The one HTTP client the app uses. */
export const api = createApiClient(apiBaseUrl)
