import { useState } from 'react'
import { Button, Card, ErrorState, PageHeader } from '../../components'
import { UnavailablePanel } from '../../components/UnavailablePanel'
import { useAuth } from './auth'

export function DispatcherProfilePage() {
  const auth = useAuth()
  const [error, setError] = useState<string | null>(null)
  async function logout() {
    try { await auth.logout() } catch { setError('Sign-out failed. Try again.') }
  }
  return <>
    <PageHeader title="Profile" subtitle="Your account and depot information." />
    {error && <ErrorState message={error} />}
    <div className="split-view">
      <div className="panel-stack">
        <Card><h2 className="text-heading-s">{auth.user?.displayName}</h2><dl className="detail-grid">
          <div><dt>Employee ID</dt><dd>{auth.user?.username}</dd></div>
          <div><dt>Role</dt><dd>{auth.user?.role}</dd></div>
          <div><dt>Depot access</dt><dd>{auth.user?.depot ?? 'All depots'}</dd></div>
        </dl></Card>
        <UnavailablePanel title="Profile and notification preferences" description="Preference editing and contact details are not provided by the account API yet." />
        <Button variant="secondary" onClick={() => void logout()}>Log out</Button>
      </div>
      <UnavailablePanel title="Today's activity" description="Planning and exception activity metrics become available with Phases 7–11." />
    </div>
  </>
}
