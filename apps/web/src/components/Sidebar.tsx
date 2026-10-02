import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import logo from './waypoint-logo.png'
import { NavLink } from 'react-router-dom'

export interface NavEntry {
  to: string
  label: string
  icon: LucideIcon
  /** Match only the exact path (use for a section's home). */
  end?: boolean
}

interface SidebarProps {
  roleLabel: string
  items: NavEntry[]
  /** Items pinned to the bottom (settings, collapse). */
  footerItems?: NavEntry[]
  status?: ReactNode
}

function NavItem({ item }: { item: NavEntry }) {
  const Icon = item.icon
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => `nav-item${isActive ? ' nav-item-active' : ''}`}>
      <Icon size={18} aria-hidden="true" />
      <span className="nav-label">{item.label}</span>
    </NavLink>
  )
}

/** Dark navigation rail on desktop; becomes a bottom tab bar on narrow screens (see shell.css). */
export function Sidebar({ roleLabel, items, footerItems, status }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label={`${roleLabel} navigation`}>
      <div className="brand">
        <img className="brand-logo" src={logo} alt="Waypoint Operations" />
      </div>
      <nav className="nav" aria-label={roleLabel}>
        <span className="text-overline nav-section">Workspace</span>
        {items.map((item) => <NavItem key={item.to} item={item} />)}
      </nav>
      <div className="sidebar-footer">
        {footerItems?.map((item) => <NavItem key={item.to} item={item} />)}
        {status}
      </div>
    </aside>
  )
}
