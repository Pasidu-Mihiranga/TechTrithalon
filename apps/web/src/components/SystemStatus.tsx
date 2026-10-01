import { useSystemHealth } from '../features/shell/useSystemHealth'

/** Sidebar status pill driven by the live /system/health endpoint. */
export function SystemStatus() {
  const health = useSystemHealth()
  let tone = 'pending'
  let text = 'Checking systems…'
  if (health.isError) { tone = 'danger'; text = 'API unavailable' }
  else if (health.data) {
    const python = health.data.intelligence === 'reachable'
    tone = python ? 'ok' : 'warning'
    text = python ? 'All systems operational' : 'Planning service offline'
  }
  return (
    <div className={`system-status system-status-${tone}`} role="status">
      <span className="system-status-dot" aria-hidden="true" />
      <span>{text}</span>
    </div>
  )
}
