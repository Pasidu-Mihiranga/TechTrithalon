import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/auth'
import './loading.css'

/** Figma Loader · Profile (94:7860): account and depot from the session; editing is not available yet. */
export function LoaderProfilePage() {
  const auth = useAuth()
  const context = useOutletContext<{ logout?: () => Promise<void>; logoutPending?: boolean } | undefined>()
  const user = auth.user
  return (
    <div className="ld-page">
      <div className="ld-head"><div className="ld-head-text"><h1 className="ld-title">Profile</h1>
        <p className="ld-sub">Shared-device account for the dock</p></div></div>
      <section className="ld-card ld-card-pad" aria-label="Account">
        <p className="ld-card-title">{user?.displayName}</p>
        <div>
          <div className="ld-kv">User ID <strong>{user?.username}</strong></div>
          <div className="ld-kv">Role <strong>Loader</strong></div>
          <div className="ld-kv">Depot <strong>{user?.depot ?? 'Not assigned'}</strong></div>
        </div>
        <p className="ld-footnote">Profile editing, notifications and help are not available yet.</p>
        <button type="button" className="ld-btn ld-btn-danger" disabled={context?.logoutPending} onClick={() => void context?.logout?.()}>
          {context?.logoutPending ? 'Signing out…' : 'Sign out'}
        </button>
      </section>
    </div>
  )
}
