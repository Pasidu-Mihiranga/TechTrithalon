import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import logo from './waypoint-logo.png'
import mark from './waypoint-mark.png'

export interface NavEntry {
  to: string
  label: string
  icon: LucideIcon
  /** Match only the exact path (use for a section's home). */
  end?: boolean
  badge?: number | string
}

interface SidebarProps {
  roleLabel: string
  items: NavEntry[]
  /** Items pinned to the bottom (settings, collapse). */
  footerItems?: NavEntry[]
  status?: ReactNode
}

function NavItem({ item, collapsed }: { item: NavEntry; collapsed: boolean }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
      className={({ isActive }) => `nav-item${isActive ? ' nav-item-active' : ''}`}
    >
      <span className="nav-icon-wrapper">
        <Icon size={18} aria-hidden="true" />
        {collapsed && item.badge !== undefined && (
          <span className="nav-badge-dot" aria-label={`${item.badge} exceptions`} />
        )}
      </span>
      {!collapsed && <span className="nav-label">{item.label}</span>}
      {!collapsed && item.badge !== undefined && (
        <span className="nav-badge">{item.badge}</span>
      )}
    </NavLink>
  )
}

/** Dark navigation rail on desktop with animated curved yellow active shelf; collapses to compact icon rail or bottom tab bar. */
export function Sidebar({ roleLabel, items, footerItems, status }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('waypoint:sidebar-collapsed') === 'true'
    } catch {
      return false
    }
  })
  const navRef = useRef<HTMLElement>(null)
  const location = useLocation()
  const [indicator, setIndicator] = useState<{ top: number; height: number; ready: boolean }>({
    top: 0,
    height: 44,
    ready: false,
  })

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('waypoint:sidebar-collapsed', String(next))
      } catch {
        // Storage may be unavailable; keep the sidebar usable for this session.
      }
      return next
    })
  }

  useEffect(() => {
    const update = () => {
      if (!navRef.current) return
      const activeEl = navRef.current.querySelector<HTMLElement>('.nav-item-active')
      if (activeEl) {
        setIndicator({
          top: activeEl.offsetTop,
          height: activeEl.offsetHeight,
          ready: true,
        })
      } else {
        setIndicator((prev) => ({ ...prev, ready: false }))
      }
    }
    update()
    const frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [location.pathname, collapsed, items])

  useEffect(() => {
    const handleResize = () => {
      if (!navRef.current) return
      const activeEl = navRef.current.querySelector<HTMLElement>('.nav-item-active')
      if (activeEl) {
        setIndicator({
          top: activeEl.offsetTop,
          height: activeEl.offsetHeight,
          ready: true,
        })
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <aside
      className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}
      aria-label={`${roleLabel} navigation`}
    >
      <div className="sidebar-strip" aria-hidden="true" />
      <div className="brand">
        <img
          className="brand-logo"
          src={collapsed ? mark : logo}
          alt="Waypoint Operations"
        />
      </div>
      <nav
        ref={navRef}
        className={`nav${indicator.ready ? ' nav-has-indicator' : ''}`}
        aria-label={roleLabel}
      >
        <span className="text-overline nav-section">Workspace</span>
        {indicator.ready && (
          <div
            className="nav-active-pill"
            style={{
              transform: `translateY(${indicator.top}px)`,
              height: `${indicator.height}px`,
            }}
            aria-hidden="true"
          >
            <svg
              className="nav-curve-top"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M24 0 V24 H0 C13.255 24 24 13.255 24 0 Z"
                fill="var(--color-brand-primary)"
              />
            </svg>
            <svg
              className="nav-curve-bottom"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M24 24 V0 H0 C13.255 0 24 10.745 24 24 Z"
                fill="var(--color-brand-primary)"
              />
            </svg>
          </div>
        )}
        {items.map((item) => (
          <NavItem key={item.to} item={item} collapsed={collapsed} />
        ))}
      </nav>
      <div className="sidebar-footer">
        {footerItems?.map((item) => (
          <NavItem key={item.to} item={item} collapsed={collapsed} />
        ))}
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={toggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose size={18} aria-hidden="true" />
              <span className="nav-label">Collapse</span>
            </>
          )}
        </button>
        {!collapsed && status}
      </div>
    </aside>
  )
}
