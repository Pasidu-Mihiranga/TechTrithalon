import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Warehouse } from 'lucide-react'
import logo from './waypoint-logo.png'
import type { NavEntry } from './Sidebar'

interface TopNavProps {
  items: NavEntry[]
  /** Role label shown next to the wordmark on narrow screens, e.g. "Loader". */
  roleLabel: string
  /** The signed-in user's scope, from the session; omitted when the account has none. */
  depotLabel?: string
  /** Initials of the signed-in user, from the session. */
  initials?: string
  /** Where the avatar leads (the role's profile page). */
  profileTo?: string
  trailing?: ReactNode
}

/**
 * Field-role navigation (Figma loader top bar): dark bar, wordmark, pill destinations, the account's
 * depot and avatar. Used instead of the dispatcher sidebar for roles that work standing at a device.
 */
export function TopNav({ items, roleLabel, depotLabel, initials, profileTo, trailing }: TopNavProps) {
  return (
    <header className="topnav">
      <img src={logo} alt="Waypoint Operations" className="topnav-logo" />
      <span className="topnav-role" aria-hidden="true">{roleLabel}</span>
      <nav aria-label={`${roleLabel} navigation`} className="topnav-links">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `topnav-link${isActive ? ' topnav-link-active' : ''}`}>
            <Icon size={18} aria-hidden="true" />
            <span className="topnav-link-label">{label}</span>
          </NavLink>
        ))}
      </nav>
      <span className="topnav-spacer" />
      {depotLabel ? (
        <span className="topnav-depot"><Warehouse size={16} aria-hidden="true" /><span>{depotLabel}</span></span>
      ) : null}
      {trailing}
      {initials ? (
        profileTo
          ? <NavLink to={profileTo} className="topnav-avatar" aria-label="Your profile">{initials}</NavLink>
          : <span className="topnav-avatar" aria-hidden="true">{initials}</span>
      ) : null}
    </header>
  )
}
