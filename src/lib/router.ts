import { useSyncExternalStore } from 'react'

/**
 * Tiny hash router.
 *
 * Why hash routing: GitHub Pages can't rewrite unknown paths to index.html, and with
 * `base: './'` every asset URL is relative to the document. Keeping the document at
 * ./index.html and putting the route after `#` means deep links, reloads and the
 * service worker scope all keep working. Patterns support `:params` for later phases
 * (e.g. `/albums/:id`).
 */

export type RouteName =
  | 'songs'
  | 'albums'
  | 'album'
  | 'artists'
  | 'artist'
  | 'playlists'
  | 'playlist'
  | 'search'
  | 'settings'

export interface Route {
  name: RouteName
  params: Record<string, string>
  path: string
}

const PATTERNS: Array<[pattern: string, name: RouteName]> = [
  ['/songs', 'songs'],
  ['/albums', 'albums'],
  ['/albums/:id', 'album'],
  ['/artists', 'artists'],
  ['/artists/:id', 'artist'],
  ['/playlists', 'playlists'],
  ['/playlists/:id', 'playlist'],
  ['/search', 'search'],
  ['/settings', 'settings'],
]

const DEFAULT_PATH = '/songs'

function currentPath(): string {
  const raw = window.location.hash.replace(/^#/, '')
  return raw.startsWith('/') ? raw : DEFAULT_PATH
}

export function matchPath(path: string): Route {
  const parts = path.split('?')[0]!.split('/').filter(Boolean)
  for (const [pattern, name] of PATTERNS) {
    const pParts = pattern.split('/').filter(Boolean)
    if (pParts.length !== parts.length) continue
    const params: Record<string, string> = {}
    const ok = pParts.every((seg, i) => {
      const actual = parts[i]!
      if (seg.startsWith(':')) {
        try {
          params[seg.slice(1)] = decodeURIComponent(actual)
        } catch {
          params[seg.slice(1)] = actual
        }
        return true
      }
      return seg === actual
    })
    if (ok) return { name, params, path }
  }
  return { name: 'songs', params: {}, path: DEFAULT_PATH }
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useRoute(): Route {
  const path = useSyncExternalStore(subscribe, currentPath, () => DEFAULT_PATH)
  return matchPath(path)
}

export function navigate(path: string, { replace = false } = {}) {
  const hash = `#${path}`
  if (replace) {
    window.history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else if (window.location.hash !== hash) {
    window.location.hash = path
  }
}

/** Which primary tab a route belongs to (detail pages highlight their parent tab). */
export function tabOf(name: RouteName): RouteName {
  return name === 'album' ? 'albums' : name === 'artist' ? 'artists' : name === 'playlist' ? 'playlists' : name
}

export function back(fallback: string) {
  if (window.history.length > 1) window.history.back()
  else navigate(fallback, { replace: true })
}

export function href(path: string) {
  return `#${path}`
}
