import type { IconName } from '../components/Icon'
import type { RouteName } from './router'

export interface NavItem {
  route: RouteName
  path: string
  label: string
  icon: IconName
}

/** Primary destinations: mobile tab bar + desktop sidebar "Library" section. */
export const PRIMARY_NAV: NavItem[] = [
  { route: 'songs', path: '/songs', label: 'Songs', icon: 'songs' },
  { route: 'albums', path: '/albums', label: 'Albums', icon: 'albums' },
  { route: 'artists', path: '/artists', label: 'Artists', icon: 'artists' },
  { route: 'playlists', path: '/playlists', label: 'Playlists', icon: 'playlists' },
  { route: 'search', path: '/search', label: 'Search', icon: 'search' },
]

export const SETTINGS_NAV: NavItem = {
  route: 'settings',
  path: '/settings',
  label: 'Settings',
  icon: 'settings',
}
