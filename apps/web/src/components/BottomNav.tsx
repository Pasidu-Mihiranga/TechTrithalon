import { NavLink, useLocation } from 'react-router-dom'
import type { NavEntry } from './Sidebar'

interface BottomNavProps {
  items: NavEntry[]
  label: string
}

/** Floating pill tab bar for phone-first roles (Figma Driver bottom nav): icon over label, yellow active pill. */
export function BottomNav({ items, label }: BottomNavProps) {
  const { pathname } = useLocation()
  return (
    <nav className="bottomnav" aria-label={label}>
      <div className="bottomnav-bar">
        {items.map(({ to, label: text, icon: Icon, end, activePattern }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `bottomnav-item${isActive || activePattern?.test(pathname) ? ' bottomnav-item-active' : ''}`}>
            <Icon size={22} aria-hidden="true" />
            <span>{text}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
