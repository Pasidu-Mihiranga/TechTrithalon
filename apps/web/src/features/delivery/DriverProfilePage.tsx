import { useOutletContext } from 'react-router-dom'
import { Bell, CircleHelp, IdCard, LogOut, MapPin, Truck } from 'lucide-react'
import { useAuth } from '../auth/auth'
import { DriverHeader, NetPill } from './DriverParts'
import { initials } from './DriverHomePage'
import { num, useDriverHome } from './driverQueries'
import './driver.css'

/** Figma Driver · Profile (61:5602): account, today's numbers from the server, work information, sign-out. */
export function DriverProfilePage() {
  const auth = useAuth()
  const home = useDriverHome()
  const context = useOutletContext<{ logout?: () => Promise<void>; logoutPending?: boolean } | undefined>()
  const user = auth.user
  const trips = home.data?.trips ?? []
  const first = trips[0]
  const distance = trips.filter(t => t.state === 'COMPLETED').reduce((sum, t) => sum + Number(t.distanceKm ?? 0), 0)
  return (
    <div className="dv-page">
      <DriverHeader title="Profile"><NetPill /></DriverHeader>
      <div className="dv-body dv-body-tight">
        <section className="dv-profile" aria-label="Account">
          <div className="dv-row">
            <span className="dv-profile-avatar">{initials(user?.displayName) ?? '—'}</span>
            <div className="dv-grow">
              <p className="dv-profile-name">{user?.displayName}</p>
              <div className="dv-row"><span className="dv-chip-dark">Driver</span>{home.data?.vehicleId ? <span className="dv-chip-dark">{home.data.vehicleId}</span> : null}</div>
            </div>
          </div>
          <div className="dv-profile-stats">
            <div><strong>{home.data ? home.data.progress.ordersDone : '—'}</strong><span>Deliveries</span></div>
            <div><strong>{home.data ? `${num(distance)} km` : '—'}</strong><span>Distance</span></div>
            <div><strong>{home.data ? trips.length : '—'}</strong><span>Trips today</span></div>
          </div>
        </section>
        <section className="dv-kv" aria-label="Work information">
          <div className="dv-section-title">Work information</div>
          <div className="dv-kv-row"><span><IdCard size={16} aria-hidden="true" />Driver ID</span><strong>{user?.username}</strong></div>
          <div className="dv-kv-row"><span><Truck size={16} aria-hidden="true" />Assigned vehicle</span><strong>{home.data?.vehicleId ? `${home.data.vehicleId}${first ? ` · ${first.brand}` : ''}` : 'No trips today'}</strong></div>
          <div className="dv-kv-row"><span><MapPin size={16} aria-hidden="true" />Depot</span><strong>{first ? `${first.depot} Depot` : '—'}</strong></div>
        </section>
        <section className="dv-kv" aria-label="Account settings">
          <div className="dv-section-title">Account</div>
          <div className="dv-kv-row"><span><Bell size={16} aria-hidden="true" />Notifications</span><strong className="dv-meta">Not available yet</strong></div>
          <div className="dv-kv-row"><span><CircleHelp size={16} aria-hidden="true" />Help</span><strong className="dv-meta">Call your dispatcher</strong></div>
        </section>
        <button type="button" className="dv-btn dv-logout" disabled={context?.logoutPending} onClick={() => void context?.logout?.()}>
          <LogOut size={18} aria-hidden="true" />{context?.logoutPending ? 'Signing out…' : 'Logout'}
        </button>
      </div>
    </div>
  )
}
