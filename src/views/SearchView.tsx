import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Artwork } from '../components/Artwork'
import { AlbumGrid, useDocumentTitle } from '../components/Common'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { TrackList } from '../components/TrackList'
import { useLibrary } from '../lib/library'
import { href } from '../lib/router'
import { normalize, plural } from '../lib/text'

let lastQuery = '' // survives tab switches within a session

export function SearchView() {
  useDocumentTitle('Search')
  const [query, setQuery] = useState(lastQuery)
  const q = useDeferredValue(normalize(query))
  const tracks = useLibrary((s) => s.tracks)
  const albums = useLibrary((s) => s.albums)
  const artists = useLibrary((s) => s.artists)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    lastQuery = query
  }, [query])

  // Autofocus on desktop only (on iPhone it would pop the keyboard on every visit).
  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) input.current?.focus()
  }, [])

  // Precompute normalized haystacks once per library change.
  const index = useMemo(
    () => ({
      tracks: tracks.map((t) => ({ t, h: normalize(`${t.title} ${t.artist} ${t.album} ${t.albumArtist}`) })),
      albums: albums.map((a) => ({ a, h: normalize(`${a.title} ${a.artist}`) })),
      artists: artists.map((a) => ({ a, h: normalize(a.name) })),
    }),
    [tracks, albums, artists],
  )

  const results = useMemo(() => {
    if (!q) return null
    const terms = q.split(' ').filter(Boolean)
    const match = (h: string) => terms.every((term) => h.includes(term))
    return {
      artists: index.artists.filter((x) => match(x.h)).map((x) => x.a).slice(0, 6),
      albums: index.albums.filter((x) => match(x.h)).map((x) => x.a).slice(0, 12),
      tracks: index.tracks.filter((x) => match(x.h)).map((x) => x.t).slice(0, 200),
    }
  }, [q, index])

  const none = results && !results.artists.length && !results.albums.length && !results.tracks.length

  return (
    <>
      <PageHeader title="Search" />
      <div className="px-4 pt-1 pb-3 md:px-8">
        <label className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-ink-3">
          <Icon name="search" size={18} />
          <input
            ref={input}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Songs, albums, artists"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-3"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="grid size-6 place-items-center rounded-full bg-ink-3/40 text-bg">
              <Icon name="close" size={13} />
            </button>
          )}
        </label>
      </div>

      {!results ? (
        <EmptyState icon="search" title="Search your library">
          {tracks.length ? `${plural(tracks.length, 'song')} on this device. Results appear as you type.` : 'Import some music first.'}
        </EmptyState>
      ) : none ? (
        <p className="px-4 py-16 text-center text-ink-3 md:px-8">No results for “{query.trim()}”</p>
      ) : (
        <div className="pb-10">
          {results.artists.length > 0 && (
            <section className="pb-4">
              <h2 className="px-4 pb-1 font-display text-lg font-semibold md:px-8">Artists</h2>
              {results.artists.map((a) => (
                <a key={a.id} href={href(`/artists/${encodeURIComponent(a.id)}`)} className="flex h-15 items-center gap-3 px-4 hover:bg-surface-2/60 md:px-8">
                  <Artwork artId={a.artId} className="size-11" rounded="rounded-full" iconSize={16} />
                  <span className="truncate text-[16px]">{a.name}</span>
                </a>
              ))}
            </section>
          )}
          {results.albums.length > 0 && (
            <section className="pb-6">
              <h2 className="px-4 pb-3 font-display text-lg font-semibold md:px-8">Albums</h2>
              <AlbumGrid albums={results.albums} />
            </section>
          )}
          {results.tracks.length > 0 && (
            <section>
              <h2 className="px-4 pb-1 font-display text-lg font-semibold md:px-8">Songs</h2>
              <TrackList tracks={results.tracks} context={{ label: `Search: ${query.trim()}`, path: '/search' }} />
            </section>
          )}
        </div>
      )}
    </>
  )
}
