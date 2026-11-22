import { useMemo, useState } from 'react'
import { Artwork } from '../components/Artwork'
import { AlbumGrid, NotFound, PlayShuffle, readPref, SettingsLink, useDocumentTitle, writePref } from '../components/Common'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { ImportButton, pickFolder, supportsFolderPicker } from '../components/Import'
import { InstallHint } from '../components/InstallHint'
import { PageHeader } from '../components/PageHeader'
import { TrackList } from '../components/TrackList'
import { VirtualList } from '../components/VirtualList'
import { artistIdOf, tracksFor, useLibrary, type Track } from '../lib/library'
import { href } from '../lib/router'
import { compareText, formatDuration, plural, sortKey } from '../lib/text'

/* ------------------------------------------------------------------ */
/* Songs                                                               */
/* ------------------------------------------------------------------ */

type SongSort = 'title' | 'artist' | 'added'
const SORTS: Array<[SongSort, string]> = [
  ['title', 'Title'],
  ['artist', 'Artist'],
  ['added', 'Recently Added'],
]

function sortSongs(tracks: Track[], by: SongSort): Track[] {
  if (by === 'title') return tracks // library keeps tracks title-sorted
  const out = [...tracks]
  if (by === 'added') out.sort((a, b) => b.addedAt - a.addedAt)
  else
    out.sort(
      (a, b) =>
        compareText(sortKey(a.artist || a.albumArtist), sortKey(b.artist || b.albumArtist)) ||
        compareText(sortKey(a.album), sortKey(b.album)) ||
        (a.discNo ?? 1) - (b.discNo ?? 1) ||
        (a.trackNo ?? 0) - (b.trackNo ?? 0),
    )
  return out
}

function LibraryEmpty() {
  return (
    <EmptyState
      icon="songs"
      title="Your library is empty"
      action={
        <div className="flex flex-col items-center gap-3">
          <ImportButton variant="pill" />
          {supportsFolderPicker() && (
            <button type="button" onClick={pickFolder} className="flex items-center gap-2 text-[15px] font-medium text-accent">
              <Icon name="folder" size={18} />
              Import a Folder
            </button>
          )}
        </div>
      }
    >
      Import MP3, M4A, FLAC, WAV or AIFF files from iCloud Drive or your device. They’re copied onto this
      device so they play with no connection.
      <span className="mt-2 block text-sm text-ink-3">On a Mac you can also drag files or folders onto the window.</span>
    </EmptyState>
  )
}

export function SongsView() {
  useDocumentTitle('Songs')
  const tracks = useLibrary((s) => s.tracks)
  const loaded = useLibrary((s) => s.loaded)
  const [sort, setSort] = useState<SongSort>(() => readPref('songSort', 'title'))
  const sorted = useMemo(() => sortSongs(tracks, sort), [tracks, sort])
  const total = useMemo(() => tracks.reduce((n, t) => n + (t.durationSec || 0), 0), [tracks])

  return (
    <>
      <PageHeader
        title="Songs"
        actions={
          <>
            {tracks.length > 0 && <ImportButton variant="icon" />}
            <SettingsLink />
          </>
        }
      />
      <InstallHint />
      {loaded && tracks.length === 0 ? (
        <LibraryEmpty />
      ) : (
        <>
          <div className="px-4 pt-2 pb-3 md:px-8">
            <PlayShuffle ids={sorted.map((t) => t.id)} context={{ label: 'Songs', path: '/songs' }} />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[13px] text-ink-3">
                {plural(tracks.length, 'song')} · {formatDuration(total)}
              </p>
              <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
                <span className="sr-only">Sort by</span>
                <select
                  value={sort}
                  onChange={(e) => {
                    const v = e.target.value as SongSort
                    setSort(v)
                    writePref('songSort', v)
                  }}
                  className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px] font-medium text-ink outline-none"
                >
                  {SORTS.map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <TrackList tracks={sorted} context={{ label: 'Songs', path: '/songs' }} />
          <div className="h-6" />
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Albums                                                              */
/* ------------------------------------------------------------------ */

export function AlbumsView() {
  useDocumentTitle('Albums')
  const albums = useLibrary((s) => s.albums)
  return (
    <>
      <PageHeader title="Albums" actions={<SettingsLink />} />
      {albums.length === 0 ? (
        <EmptyState icon="albums" title="No albums yet">
          Albums are built automatically from your files’ tags and artwork.
        </EmptyState>
      ) : (
        <div className="pt-2 pb-8">
          <AlbumGrid albums={albums} />
        </div>
      )}
    </>
  )
}

export function AlbumDetailView({ id }: { id: string }) {
  const album = useLibrary((s) => s.albumById.get(id))
  const version = useLibrary((s) => s.version)
  const tracks = useMemo(() => (album ? tracksFor(album.trackIds) : []), [album, version])
  useDocumentTitle(album?.title ?? 'Album')
  if (!album) {
    return (
      <>
        <PageHeader title="Album" back={{ label: 'Albums', path: '/albums' }} compact />
        <NotFound what="album" />
      </>
    )
  }
  const genre = tracks.find((t) => t.genre)?.genre
  const meta = [genre, album.year].filter(Boolean).join(' · ')
  const context = { label: album.title, path: `/albums/${encodeURIComponent(album.id)}` }

  return (
    <>
      <PageHeader title={album.title} back={{ label: 'Albums', path: '/albums' }} compact />
      <section className="flex flex-col items-center gap-5 px-4 pt-2 pb-5 text-center md:flex-row md:items-end md:px-8 md:text-left">
        <Artwork artId={album.artId} variant="full" className="size-60 shadow-xl shadow-black/25 md:size-52" rounded="rounded-xl" iconSize={48} />
        <div className="min-w-0 md:flex-1">
          <h1 className="font-display text-[24px] leading-tight font-bold tracking-tight md:text-3xl">{album.title}</h1>
          <a href={href(`/artists/${encodeURIComponent(artistIdOf(album.artist))}`)} className="mt-1 block text-[19px] text-accent">
            {album.artist}
          </a>
          {meta && <p className="mt-1 text-[13px] text-ink-3 uppercase">{meta}</p>}
          <PlayShuffle ids={album.trackIds} context={context} className="mt-4 md:max-w-sm" />
        </div>
      </section>
      <TrackList
        tracks={tracks}
        variant="album"
        context={context}
        menuContext={() => ({ kind: 'album', albumId: album.id })}
      />
      <p className="px-4 pt-3 pb-10 text-[13px] text-ink-3 md:px-8">
        {plural(tracks.length, 'song')}, {formatDuration(album.durationSec)}
      </p>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Artists                                                             */
/* ------------------------------------------------------------------ */

export function ArtistsView() {
  useDocumentTitle('Artists')
  const artists = useLibrary((s) => s.artists)
  return (
    <>
      <PageHeader title="Artists" actions={<SettingsLink />} />
      {artists.length === 0 ? (
        <EmptyState icon="artists" title="No artists yet">
          Artists appear here once you import music.
        </EmptyState>
      ) : (
        <div className="pt-1 pb-8">
          <VirtualList
            items={artists}
            rowHeight={64}
            getKey={(a) => a.id}
            render={(a) => (
              <a href={href(`/artists/${encodeURIComponent(a.id)}`)} className="flex h-full items-center gap-3 px-4 hover:bg-surface-2/60 md:px-8">
                <Artwork artId={a.artId} className="size-12" rounded="rounded-full" iconSize={18} />
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2 self-stretch border-b border-line">
                  <span className="min-w-0">
                    <span className="block truncate text-[16px]">{a.name}</span>
                    <span className="block truncate text-[13px] text-ink-3">
                      {[a.albumIds.length ? plural(a.albumIds.length, 'album') : null, plural(a.trackIds.length, 'song')].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={18} className="shrink-0 text-ink-3" />
                </span>
              </a>
            )}
          />
        </div>
      )}
    </>
  )
}

export function ArtistDetailView({ id }: { id: string }) {
  const artist = useLibrary((s) => s.artistById.get(id))
  const albumById = useLibrary((s) => s.albumById)
  const version = useLibrary((s) => s.version)
  const tracks = useMemo(() => (artist ? tracksFor(artist.trackIds) : []), [artist, version])
  useDocumentTitle(artist?.name ?? 'Artist')
  if (!artist) {
    return (
      <>
        <PageHeader title="Artist" back={{ label: 'Artists', path: '/artists' }} compact />
        <NotFound what="artist" />
      </>
    )
  }
  const albums = artist.albumIds.map((a) => albumById.get(a)).filter((a): a is NonNullable<typeof a> => !!a)
  const context = { label: artist.name, path: `/artists/${encodeURIComponent(artist.id)}` }

  return (
    <>
      <PageHeader title={artist.name} back={{ label: 'Artists', path: '/artists' }} />
      <div className="px-4 pt-1 pb-4 md:px-8">
        <PlayShuffle ids={tracks.map((t) => t.id)} context={context} className="md:max-w-sm" />
      </div>
      {albums.length > 0 && (
        <section className="pb-4">
          <h2 className="px-4 pb-3 font-display text-xl font-semibold md:px-8">Albums</h2>
          <AlbumGrid albums={albums} />
        </section>
      )}
      <section className="pt-4 pb-8">
        <h2 className="px-4 pb-1 font-display text-xl font-semibold md:px-8">Songs</h2>
        <TrackList tracks={tracks} context={context} />
      </section>
    </>
  )
}
