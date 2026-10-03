import { Activity, ClipboardList, History, House, PackagePlus, Route, Settings, TrendingUp, TriangleAlert, Truck, User } from 'lucide-react'
import type { NavEntry } from '../components'

export type RoleKey = 'dispatcher' | 'store' | 'loader' | 'driver'

/** Navigation for one role. `phase` names the plan phase that delivers the page, shown in its empty state. */
export interface RolePage extends NavEntry {
  title: string
  description: string
  phase: string
}

export interface RoleConfig {
  key: RoleKey
  label: string
  basePath: string
  pages: RolePage[]
  footerPages?: RolePage[]
}

export const roles: Record<RoleKey, RoleConfig> = {
  dispatcher: {
    key: 'dispatcher', label: 'Dispatcher', basePath: '/dispatcher',
    pages: [
      { to: '/dispatcher', label: 'Home', icon: House, end: true, title: 'Dashboard', description: 'Planning status and items that need attention.', phase: 'Phase 3A' },
      { to: '/dispatcher/orders', label: 'Orders', icon: ClipboardList, title: 'Orders', description: 'All confirmed orders for the planning day.', phase: 'Phase 3A' },
      { to: '/dispatcher/planning', label: 'Planning', icon: Route, title: 'Planning', description: 'Step 1 confirmed orders on live data; later steps arrive in Phases 5–11.', phase: 'Phase 3A / 5+' },
      { to: '/dispatcher/live-operations', label: 'Live Operations', icon: Activity, title: 'Live Operations', description: 'Trips in progress and problems on the road.', phase: 'Phase 16' },
      { to: '/dispatcher/forecast', label: 'Forecast', icon: TrendingUp, title: 'Capacity forecast', description: 'Expected demand against fleet capacity.', phase: 'Phase 17' },
      { to: '/dispatcher/fleet', label: 'Fleet', icon: Truck, title: 'Fleet', description: 'Vehicles, availability and workshop status.', phase: 'Phase 3A' },
      { to: '/dispatcher/exceptions', label: 'Exceptions', icon: TriangleAlert, title: 'Exceptions', description: 'Orders the plan could not place automatically.', phase: 'Phase 10' },
      { to: '/dispatcher/deferred-orders', label: 'Deferred Orders', icon: History, title: 'Deferred orders', description: 'Orders moved to a later run, with the reason.', phase: 'Phase 8' },
    ],
    footerPages: [
      { to: '/dispatcher/settings', label: 'Settings', icon: Settings, title: 'Settings', description: 'Your profile and preferences.', phase: 'Phase 2' },
    ],
  },
  store: {
    key: 'store', label: 'Store manager', basePath: '/store',
    pages: [
      { to: '/store', label: 'Home', icon: House, end: true, title: 'Home', description: 'Order cutoff and your recent orders.', phase: 'Phase 3A' },
      { to: '/store/orders', label: 'My orders', icon: ClipboardList, end: true, title: 'My orders', description: 'Orders from your outlet and their status.', phase: 'Phase 3A' },
      { to: '/store/orders/new', label: 'Place order', icon: PackagePlus, title: 'Place an order', description: 'Place and confirm an order before the 16:00 cutoff.', phase: 'Phase 4' },
    ],
  },
  loader: {
    key: 'loader', label: 'Loader', basePath: '/loader',
    pages: [
      { to: '/loader', label: 'Home', icon: House, end: true, title: 'Trips to load', description: 'Today’s trips for your depot.', phase: 'Phase 12' },
      { to: '/loader/issues', label: 'Issues', icon: TriangleAlert, title: 'Loading issues', description: 'Shortfalls and damage you reported.', phase: 'Phase 12' },
      { to: '/loader/profile', label: 'Profile', icon: User, title: 'Profile', description: 'Your account and depot.', phase: 'Phase 12' },
    ],
  },
  driver: {
    key: 'driver', label: 'Driver', basePath: '/driver',
    pages: [
      { to: '/driver', label: 'Trips', icon: Truck, end: true, title: 'My trips', description: 'Your trips and stops for today.', phase: 'Phase 13' },
      { to: '/driver/profile', label: 'Profile', icon: User, title: 'Profile', description: 'Your account.', phase: 'Phase 13' },
    ],
  },
}
