import createClient from 'openapi-fetch'
import type { paths } from '../generated/api'
import { apiBaseUrl } from './config'

/** Resolve fetch at call time, so tests and polyfills that replace the global take effect. */
const lateFetch: typeof fetch = (input, init) => globalThis.fetch(input, init)

/** Build a typed client. Types come from apps/api/openapi.json. */
export function createApiClient(baseUrl: string, fetchImpl: typeof fetch = lateFetch) {
  return createClient<paths>({ baseUrl, fetch: fetchImpl })
}

/** The one HTTP client the app uses. */
export const api = createApiClient(apiBaseUrl)
