import { afterEach, describe, expect, it, vi } from 'vitest'
import { NetworkError } from '@techtrithalon/field-core'
import { httpSyncTransport } from './syncTransport'

const upload = {
  clientUploadId: '01911c00-0000-7000-8000-000000000001',
  planDate: '2026-06-26', tripIndex: 1, orderId: 1, kind: 'PHOTO' as const,
  blob: new Blob(['synthetic proof'], { type: 'image/jpeg' }),
}

afterEach(() => vi.unstubAllGlobals())

describe('proof upload retry', () => {
  it('keeps a proof pending when the server is temporarily unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'UNAVAILABLE' }), { status: 503 })))
    await expect(httpSyncTransport.uploadProof(upload)).rejects.toBeInstanceOf(NetworkError)
  })

  it('settles a proof when the server rejects its content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'INVALID_PROOF', detail: 'File is invalid' }), {
      status: 422, headers: { 'Content-Type': 'application/json' },
    })))
    await expect(httpSyncTransport.uploadProof(upload)).resolves.toEqual({ ok: false, code: 'INVALID_PROOF', message: 'File is invalid' })
  })
})
