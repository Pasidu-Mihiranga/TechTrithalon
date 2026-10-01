import { useQuery } from '@tanstack/react-query'

type Health = { service: string; status: string; intelligence: string }
const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1'

async function getHealth(): Promise<Health> {
  const response = await fetch(`${apiBase}/system/health`)
  if (!response.ok) throw new Error(`API returned ${response.status}`)
  return response.json() as Promise<Health>
}

export default function App() {
  const health = useQuery({ queryKey: ['system-health'], queryFn: getHealth, retry: false })
  return (
    <main className="page">
      <span className="eyebrow">TechTrithalon</span>
      <h1>Waypoint Operations</h1>
      <p>Development foundation for ordering, planning, loading, delivery, and capacity decisions.</p>
      <section className="status" aria-live="polite">
        <h2>Service status</h2>
        {health.isPending && <p>Checking the operational API…</p>}
        {health.isError && <p>API unavailable. Start the stack with <code>docker compose up --build</code>.</p>}
        {health.data && <p>Spring: {health.data.status} · Python: {health.data.intelligence}</p>}
      </section>
    </main>
  )
}
