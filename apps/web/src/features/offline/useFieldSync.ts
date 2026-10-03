import { useEffect, useSyncExternalStore } from 'react'
import type { SyncEngine, SyncStatus } from '@techtrithalon/field-core'
import { fieldEngine } from '../../lib/fieldSync'
import { useAuth } from '../auth/auth'

const idle: SyncStatus = { pending: 0, syncing: false, done: 0, total: 0, needsReview: 0, version: 0 }

/** The driver's sync engine and its live status. */
export function useFieldSync(): { engine: SyncEngine | null; status: SyncStatus } {
  const auth = useAuth()
  const engine = auth.user?.username ? fieldEngine(auth.user.username) : null
  const status = useSyncExternalStore(
    (onChange) => engine ? engine.subscribe(onChange) : () => {},
    () => engine ? engine.getStatus() : idle,
    () => idle,
  )
  return { engine, status }
}

/**
 * Sync triggers: when the connection returns, when the app comes back to the foreground, every 30
 * seconds while something is pending, and once on start.
 */
export function useSyncTriggers(engine: SyncEngine | null) {
  useEffect(() => {
    if (!engine) return
    const run = () => { if (engine.getStatus().pending > 0 && navigator.onLine !== false) void engine.sync() }
    const visible = () => { if (document.visibilityState === 'visible') run() }
    void engine.ready().then(run)
    window.addEventListener('online', run)
    document.addEventListener('visibilitychange', visible)
    const timer = window.setInterval(run, 30_000)
    return () => {
      window.removeEventListener('online', run)
      document.removeEventListener('visibilitychange', visible)
      window.clearInterval(timer)
    }
  }, [engine])
}
