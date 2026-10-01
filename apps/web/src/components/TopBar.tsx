import type { ReactNode } from 'react'
import { Search } from 'lucide-react'

interface TopBarProps {
  /** Leading controls, for example the depot switcher once its data source exists. */
  leading?: ReactNode
  /** The signed-in user. Comes from the session (Phase 2); never hard-coded. */
  user?: ReactNode
  searchPlaceholder?: string
  /** True once search is implemented. Until then the field is shown disabled rather than pretending to work. */
  searchEnabled?: boolean
}

export function TopBar({ leading, user, searchPlaceholder = 'Search', searchEnabled = false }: TopBarProps) {
  return (
    <div className="topbar">
      {leading}
      <label className="topbar-search">
        <Search size={16} aria-hidden="true" />
        <span className="visually-hidden">{searchPlaceholder}</span>
        <input type="search" placeholder={searchPlaceholder} disabled={!searchEnabled} title={searchEnabled ? undefined : 'Search is not available yet'} />
      </label>
      <div className="topbar-user">{user}</div>
    </div>
  )
}
