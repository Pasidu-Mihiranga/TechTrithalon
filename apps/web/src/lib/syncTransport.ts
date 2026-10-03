import { AuthError, NetworkError } from '@techtrithalon/field-core'
import type { FieldAction, ProofUpload, SyncResult, SyncTransport, UploadOutcome } from '@techtrithalon/field-core'
import { api } from './apiClient'

/** Fetch failures (no connection, DNS, CORS during an outage) are network errors: retry later. */
async function call<T>(request: () => Promise<{ data?: T; error?: unknown; response: Response }>) {
  let result
  try { result = await request() } catch { throw new NetworkError() }
  return result
}

/** The driver API as the field-core transport. 5xx and 401 keep entries pending; 4xx on an upload is final. */
export const httpSyncTransport: SyncTransport = {
  async sendActions(actions: FieldAction[]): Promise<SyncResult[]> {
    const { data, response } = await call(() => api.POST('/api/v1/driver/sync', { body: { actions } }))
    if (response.status === 401) throw new AuthError()
    if (!data) throw new NetworkError(`Sync failed (${response.status})`)
    return (data.results ?? []) as SyncResult[]
  },
  async uploadProof(upload: ProofUpload): Promise<UploadOutcome> {
    const form = new FormData()
    form.append('file', upload.blob, upload.kind === 'PHOTO' ? 'proof.jpg' : 'signature.png')
    const { data, error, response } = await call(() => api.POST('/api/v1/driver/trips/{tripIndex}/orders/{orderId}/proofs', {
      params: { path: { tripIndex: upload.tripIndex, orderId: upload.orderId },
        query: { kind: upload.kind, date: upload.planDate, clientUploadId: upload.clientUploadId } },
      body: form as never,
      bodySerializer: (body: unknown) => body as FormData,
    }))
    if (data) return { ok: true }
    if (response.status === 401) throw new AuthError()
    if (response.status >= 500 && response.status !== 503) throw new NetworkError(`Upload failed (${response.status})`)
    const body = (error && typeof error === 'object' ? error : {}) as { code?: string; detail?: string }
    return { ok: false, code: body.code, message: body.detail }
  },
}
