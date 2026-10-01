import { useSystemHealth } from './features/shell/useSystemHealth'

export default function App() {
  const health = useSystemHealth()
  return (
    <main className="page">
      <span className="eyebrow">TechTrithalon</span>
      <h1>Waypoint Operations</h1>
      <p>Development foundation for ordering, planning, loading, delivery, and capacity decisions.</p>
      <section className="status" aria-live="polite">
        <h2>Service status</h2>
        {health.isPending && <p>Checking the operational API…</p>}
        {health.isError && <p>API unavailable. Start the stack with <code>docker compose up --build</code>.</p>}
        {health.data && (
          <p>
            Spring: {health.data.status} · Python: {health.data.intelligence}
          </p>
        )}
      </section>
    </main>
  )
}
