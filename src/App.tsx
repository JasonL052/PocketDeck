import { useEffect, useRef } from 'react'
import { AppShell } from './components/AppShell'
import { DropZone, ImportInputs, ImportToast } from './components/Import'
import { NowPlaying } from './components/NowPlaying'
import { SheetHost } from './components/Sheets'
import { Toasts } from './components/Toasts'
import { UpdatePrompt } from './components/UpdatePrompt'
import { useLibrary } from './lib/library'
import { next, previous, seek, togglePlay, playhead } from './lib/player'
import { navigate, useRoute, type Route } from './lib/router'
import { ui } from './lib/ui'
import { AlbumDetailView, AlbumsView, ArtistDetailView, ArtistsView, SongsView } from './views/LibraryViews'
import { PlaylistDetailView, PlaylistsView } from './views/PlaylistViews'
import { SearchView } from './views/SearchView'
import { SettingsView } from './views/SettingsView'

function View({ route }: { route: Route }) {
  const id = route.params.id ?? ''
  switch (route.name) {
    case 'songs':
      return <SongsView />
    case 'albums':
      return <AlbumsView />
    case 'album':
      return <AlbumDetailView key={id} id={id} />
    case 'artists':
      return <ArtistsView />
    case 'artist':
      return <ArtistDetailView key={id} id={id} />
    case 'playlists':
      return <PlaylistsView />
    case 'playlist':
      return <PlaylistDetailView key={id} id={id} />
    case 'search':
      return <SearchView />
    case 'settings':
      return <SettingsView />
  }
}

/** Mac keyboard shortcuts. Ignored while typing in a field or when a sheet is open. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (ui.get().sheet) return
      const mod = e.metaKey || e.ctrlKey
      if (e.code === 'Space' && !mod) {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (mod) next()
        else seek(playhead.get().position + 10)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (mod) previous()
        else seek(playhead.get().position - 10)
      } else if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        ui.set({ nowPlaying: false })
        navigate('/search')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export default function App() {
  const route = useRoute()
  const loaded = useLibrary((s) => s.loaded)
  const error = useLibrary((s) => s.error)
  const lastPath = useRef(route.path)
  useShortcuts()

  // New destination → start at the top of the scroll container.
  useEffect(() => {
    if (lastPath.current !== route.path) {
      document.getElementById('main')?.scrollTo({ top: 0 })
      lastPath.current = route.path
    }
  }, [route.path])

  return (
    <>
      <AppShell route={route}>
        {error ? (
          <div className="mx-auto max-w-md px-6 py-24 text-center">
            <p className="font-display text-xl font-semibold">Couldn’t open your library</p>
            <p className="mt-2 text-[15px] text-ink-2">{error}</p>
            <button type="button" onClick={() => location.reload()} className="mt-6 rounded-full bg-accent px-5 py-2.5 font-semibold text-accent-ink">
              Reload
            </button>
          </div>
        ) : loaded ? (
          <View route={route} />
        ) : null}
      </AppShell>
      <NowPlaying />
      <SheetHost />
      <ImportInputs />
      <ImportToast />
      <DropZone />
      <Toasts />
      <UpdatePrompt />
    </>
  )
}
