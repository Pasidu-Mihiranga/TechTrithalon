import { useFieldSync, useSyncTriggers } from './useFieldSync'

/** Mounted once in the driver shell: keeps the outbox syncing in the background. Renders nothing. */
export function DriverSync() {
  const { engine } = useFieldSync()
  useSyncTriggers(engine)
  return null
}
