import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from './apiClient'

describe('typed API client', () => {
  it('calls the generated health path on the configured origin', async () => {
    const fetchSpy = vi.fn(async (_request: Request) =>
      new Response(JSON.stringify({ service: 'api', status: 'ok', intelligence: 'reachable' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = createApiClient('http://api.test', fetchSpy as unknown as typeof fetch)

    const { data, error } = await client.GET('/api/v1/system/health')

    expect(error).toBeUndefined()
    expect(data).toEqual({ service: 'api', status: 'ok', intelligence: 'reachable' })
    const request = fetchSpy.mock.calls[0][0]
    expect(request.url).toBe('http://api.test/api/v1/system/health')
    expect(request.method).toBe('GET')
  })

  it('surfaces non-2xx responses as an error value', async () => {
    const fetchSpy = vi.fn(async (_request: Request) =>
      new Response(JSON.stringify({ code: 'INTERNAL_ERROR' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = createApiClient('http://api.test', fetchSpy as unknown as typeof fetch)

    const { data, error } = await client.GET('/api/v1/reference/summary')

    expect(data).toBeUndefined()
    expect(error).toBeDefined()
  })
})
