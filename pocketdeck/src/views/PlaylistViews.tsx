import { useMemo, useState } from 'react'
import { Artwork } from '../components/Artwork'
import { NotFound, PlayShuffle, SettingsLink, useDocumentTitle } from '../components/Common'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { TrackList } from '../components/TrackList'
import {
  createPlaylist,
  deletePlaylist,
  movePlaylistItem,
  removeFromPlaylist,
  renamePlaylist,
  useLibrary,
  type Playlist,
  type Track,
} from '../lib/library'
import { href, navigate } from '../lib/router'
import { formatDuration, plural } from '../lib/text'
import { confirmAction, promptText, showToast } from '../lib/ui'

export async function newPlaylistFlow(go = true) {
  const name = await promptText({ title: 'New Playlist', placeholder: 'Playlist name', confirmLabel: 'Create' })
  if (!name) return
  const p = await createPlaylist(name)
  if (go) navigate(`/playlists/${p.id}`)
}

/** 2×2 mosaic of the first distinct artworks in a playlist. */
export function PlaylistCover({ playlist, className = '' }: { playlist: Playlist; className?: string }) {
  const byId = useLibrary((s) => s.byId)
  const arts = useMemo(() => {
    const out: string[] = []
    for (const id of playlist.trackIds) {
      const a = byId.get(id)?.artId
      if (a && !out.includes(a)) out.push(a)
      if (out.length === 4) break
    }
    return out
  }, [playlist.trackIds, byId])

  if (arts.length < 4) {
    return <Artwork artId={arts[0]} className={className} rounded="rounded-lg" iconSize={22} />
  }
  return (
    <div className={`grid shrink-0 grid-cols-2 overflow-hidden rounded-lg ${className}`}>
      {arts.map((a) => (
        <Artwork key={a} artId={a} className="aspect-square w-full" rounded="" iconSize={12} />
      ))}
    </div>
  )
}

export function PlaylistsView() {
  useDocumentTitle('Playlists')
  const playlists = useLibrary((s) => s.playlists)
  return (
    <>
      <PageHeader title="Playlists" actions={<SettingsLink />} />
      <div className="pb-8">
        <button
          type="button"
          onClick={() => void newPlaylistFlow()}
          className="flex h-18 w-full items-center gap-3 px-4 text-left hover:bg-surface-2/60 md:px-8"
        >
          <span className="grid size-14 place-items-center rounded-lg bg-surface-2 text-accent">
            <Icon name="plus" size={26} />
          </span>
          <span className="text-[16px] font-medium text-accent">New Playlist…</span>
        </button>
        {playlists.length === 0 ? (
          <EmptyState icon="playlists" title="No playlists yet">
            Create one here, or add songs from any song’s ⋯ menu.
          </EmptyState>
        ) : (
          playlists.map((p) => (
            <a
              key={p.id}
              href={href(`/playlists/${p.id}`)}
              className="flex h-18 items-center gap-3 px-4 hover:bg-surface-2/60 md:px-8"
            >
              <PlaylistCover playlist={p} className="size-14" />
              <span className="flex min-w-0 flex-1 items-center justify-between gap-2 self-stretch border-b border-line">
                <span className="min-w-0">
                  <span className="block truncate text-[16px]">{p.name}</span>
                  <span className="block text-[13px] text-ink-3">{plural(p.trackIds.length, 'song')}</span>
                </span>
                <Icon name="chevronRight" size={18} className="shrink-0 text-ink-3" />
              </span>
            </a>
          ))
        )}
      </div>
    </>
  )
}

function EditRow({ track, index, count, playlistId }: { track: Track; index: number; count: number; playlistId: string }) {
  return (
    <div className="flex h-full items-center gap-2 px-4 md:px-8">
      <button
        type="button"
        aria-label={`Remove ${track.title}`}
        onClick={() => void removeFromPlaylist(playlistId, index)}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-red-500 text-white"
      >
        <Icon name="close" size={16} />
      </button>
      <Artwork artId={track.artId} className="size-10" iconSize={16} />
      <span className="min-w-0 flex-1 self-stretch border-b border-line py-2">
        <span className="block truncate text-[15px]">{track.title}</span>
        <span className="block truncate text-[13px] text-ink-2">{track.artist || 'Unknown Artist'}</span>
      </span>
      <button
        type="button"
        aria-label="Move up"
        disabled={index === 0}
        onClick={() => void movePlaylistItem(playlistId, index, index - 1)}
        className="grid size-9 place-items-center rounded-full text-ink-2 disabled:opacity-25"
      >
        <Icon name="arrowUp" size={18} />
      </button>
      <button
        type="button"
        aria-label="Move down"
        disabled={index === count - 1}
        onClick={() => void movePlaylistItem(playlistId, index, index + 1)}
        className="grid size-9 place-items-center rounded-full text-ink-2 disabled:opacity-25"
      >
        <Icon name="arrowDown" size={18} />
      </button>
    </div>
  )
}

export function PlaylistDetailView({ id }: { id: string }) {
  const playlist = useLibrary((s) => s.playlists.find((p) => p.id === id))
  const byId = useLibrary((s) => s.byId)
  const [editing, setEditing] = useState(false)
  const tracks = useMemo(
    () => (playlist ? playlist.trackIds.map((t) => byId.get(t)).filter((t): t is Track => !!t) : []),
    [playlist, byId],
  )
  useDocumentTitle(playlist?.name ?? 'Playlist')

  if (!playlist) {
    return (
      <>
        <PageHeader title="Playlist" back={{ label: 'Playlists', path: '/playlists' }} compact />
        <NotFound what="playlist" />
      </>
    )
  }

  const duration = tracks.reduce((n, t) => n + (t.durationSec || 0), 0)
  const context = { label: playlist.name, path: `/playlists/${playlist.id}` }
  const editButton = (
    <button
      type="button"
      onClick={() => setEditing((e) => !e)}
      className={`rounded-lg px-3 py-1.5 text-[16px] ${editing ? 'font-semibold text-accent' : 'text-accent'}`}
    >
      {editing ? 'Done' : 'Edit'}
    </button>
  )

  return (
    <>
      <PageHeader title={playlist.name} back={{ label: 'Playlists', path: '/playlists' }} actions={editButton} compact />
      <section className="flex flex-col items-center gap-5 px-4 pt-2 pb-5 text-center md:flex-row md:items-end md:px-8 md:text-left">
        <PlaylistCover playlist={playlist} className="size-56 shadow-xl shadow-black/25 md:size-48" />
        <div className="min-w-0 md:flex-1">
          <h1 className="font-display text-[24px] leading-tight font-bold tracking-tight md:text-3xl">{playlist.name}</h1>
          <p className="mt-1 text-[13px] text-ink-3">
            {plural(tracks.length, 'song')}
            {tracks.length ? ` · ${formatDuration(duration)}` : ''}
          </p>
          {editing ? (
            <div className="mt-4 flex justify-center gap-3 md:justify-start">
              <button
                type="button"
                className="flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-2.5 text-[15px] font-semibold"
                onClick={async () => {
                  const name = await promptText({ title: 'Rename Playlist', initial: playlist.name, confirmLabel: 'Rename' })
                  if (name) await renamePlaylist(playlist.id, name)
                }}
              >
                <Icon name="pencil" size={16} />
                Rename
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-2.5 text-[15px] font-semibold text-red-500"
                onClick={async () => {
                  const ok = await confirmAction({
                    title: `Delete “${playlist.name}”?`,
                    message: 'The songs stay in your library.',
                    confirmLabel: 'Delete Playlist',
                    destructive: true,
                  })
                  if (!ok) return
                  navigate('/playlists', { replace: true })
                  await deletePlaylist(playlist.id)
                  showToast('Playlist deleted')
                }}
              >
                <Icon name="trash" size={16} />
                Delete
              </button>
            </div>
          ) : (
            <PlayShuffle ids={tracks.map((t) => t.id)} context={context} className="mt-4 md:max-w-sm" />
          )}
        </div>
      </section>

      {tracks.length === 0 ? (
        <p className="px-4 py-10 text-center text-[15px] text-ink-3 md:px-8">
          Add songs from any song’s ⋯ menu → Add to Playlist.
        </p>
      ) : editing ? (
        <div className="pb-10">
          {tracks.map((t, i) => (
            <div key={`${t.id}:${i}`} className="h-15">
              <EditRow track={t} index={i} count={tracks.length} playlistId={playlist.id} />
            </div>
          ))}
        </div>
      ) : (
        <div className="pb-10">
          <TrackList
            tracks={tracks}
            variant="playlist"
            context={context}
            menuContext={(i) => ({ kind: 'playlist', playlistId: playlist.id, index: i })}
          />
        </div>
      )}
    </>
  )
}
