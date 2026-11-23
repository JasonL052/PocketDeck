import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { MiniPlayer } from './MiniPlayer'
import { PlayerBar } from './PlayerBar'
import { tabOf, type Route } from '../lib/router'

/**
 * Responsive frame.
 *  - < md (iPhone): [scrolling main] / [mini-player] / [tab bar + home-indicator inset]
 *  - ≥ md (Mac, iPad): [sidebar | scrolling main] / [player bar spanning both]
 *
 * Only <main> scrolls; body has overflow hidden + overscroll-behavior none so the
 * standalone app never rubber-bands as a whole.
 */
export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const tab = tabOf(route.name)
  return (
    <div className="flex h-dvh flex-col bg-bg text-ink md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)_auto]">
      <Sidebar route={route} tab={tab} />

      <main id="main" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-safe md:px-0">
        {children}
      </main>

      <PlayerBar />

      <div className="md:hidden" data-chrome>
        <MiniPlayer />
        <TabBar active={tab} />
      </div>
    </div>
  )
}
