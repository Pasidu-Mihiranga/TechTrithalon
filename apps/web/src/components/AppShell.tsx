import type { ReactNode } from 'react'

interface AppShellProps {
  sidebar: ReactNode
  topBar: ReactNode
  children: ReactNode
}

/** Page frame shared by every role: navigation, top bar, and the scrolling content area. */
export function AppShell({ sidebar, topBar, children }: AppShellProps) {
  return (
    <div className="shell">
      <a href="#main" className="skip-link">Skip to content</a>
      {sidebar}
      <div className="shell-body">
        {topBar}
        <main id="main" className="shell-main">{children}</main>
      </div>
    </div>
  )
}
