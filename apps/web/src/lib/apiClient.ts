import createClient from 'openapi-fetch'
import type { paths } from '../generated/api'
import { apiBaseUrl } from './config'

/** Resolve fetch at call time, so tests and polyfills that replace the global take effect. */
const lateFetch: typeof fetch = (input, init) => globalThis.fetch(input, init)

/** Build a typed client. Types come from apps/api/openapi.json. */
export function createApiClient(baseUrl: string, fetchImpl: typeof fetch = lateFetch) {
  const client = createClient<paths>({ baseUrl, fetch: fetchImpl, credentials: 'include' })
  client.use({
    onRequest({ request }) {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) request.headers.set('X-Requested-With', 'Waypoint')
    },
    onResponse({ request, response }) {
      if (response.status === 401 && !new URL(request.url).pathname.startsWith('/api/v1/auth/') && typeof window !== 'undefined') window.dispatchEvent(new Event('waypoint:session-expired'))
    },
  })
  return client
}

/** The one HTTP client the app uses. */
export const api = createApiClient(apiBaseUrl)
