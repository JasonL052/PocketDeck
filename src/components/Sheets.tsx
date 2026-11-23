import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  addToPlaylist,
  albumIdOf,
  albumArtistOf,
  artistIdOf,
  createPlaylist,
  deleteTracks,
  removeFromPlaylist,
  useLibrary,
} from '../lib/library'
import { addToQueue, forgetTracks, playNext, removeFromQueue } from '../lib/player'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { plural } from '../lib/text'
import { closeNowPlaying, closeSheet, confirmAction, openSheet, promptText, showToast, ui, type Sheet } from '../lib/ui'
import { Artwork } from './Artwork'
import { Icon, type IconName } from './Icon'

/** Bottom sheet on iPhone, centered dialog on wider screens. */
export function SheetFrame({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="Close" onClick={onClose} className="pd-fade-in absolute inset-0 bg-black/45" />
      <div className="pd-sheet-in md:pd-pop-in relative max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl bg-surface pb-safe shadow-2xl md:max-w-sm md:rounded-2xl md:pb-0">
        {children}
      </div>
    </div>
  )
}

function Item({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: IconName
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-12 w-full items-center gap-3.5 px-5 text-left text-[16px] hover:bg-surface-2 active:bg-surface-2 ${
        destructive ? 'text-red-500' : 'text-ink'
      }`}
    >
      <Icon name={icon} size={21} className={destructive ? '' : 'text-ink-2'} />
      {label}
    </button>
  )
}

function go(path: string) {
  closeSheet()
  closeNowPlaying()
  navigate(path)
}

function TrackActions({ sheet }: { sheet: Extract<Sheet, { kind: 'track' }> }) {
  const t = useLibrary((s) => s.byId.get(sheet.trackId))
  if (!t) return null
  const ctx = sheet.context
  const albumId = albumIdOf(t)
  const artistName = albumArtistOf(t)

  return (
    <SheetFrame onClose={closeSheet} label={`Actions for ${t.title}`}>
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <Artwork artId={t.artId} className="size-12" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{t.title}</p>
          <p className="truncate text-sm text-ink-2">{[t.artist || 'Unknown Artist', t.album].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <div className="py-1.5">
        {ctx.kind !== 'queue' && (
          <>
            <Item icon="playNext" label="Play Next" onClick={() => { playNext([t.id]); closeSheet(); showToast('Playing next') }} />
            <Item icon="addQueue" label="Add to Queue" onClick={() => { addToQueue([t.id]); closeSheet(); showToast('Added to queue') }} />
          </>
        )}
        <Item icon="playlists" label="Add to Playlist…" onClick={() => openSheet({ kind: 'addToPlaylist', trackIds: [t.id] })} />
        {ctx.kind !== 'album' && <Item icon="albums" label="Go to Album" onClick={() => go(`/albums/${encodeURIComponent(albumId)}`)} />}
        <Item icon="artists" label="Go to Artist" onClick={() => go(`/artists/${encodeURIComponent(artistIdOf(artistName))}`)} />
        {ctx.kind === 'playlist' && (
          <Item
            icon="close"
            label="Remove from Playlist"
            onClick={() => {
              void removeFromPlaylist(ctx.playlistId, ctx.index)
              closeSheet()
            }}
          />
        )}
        {ctx.kind === 'queue' && (
          <Item icon="close" label="Remove from Queue" onClick={() => { removeFromQueue(ctx.index); closeSheet() }} />
        )}
        <Item
          icon="trash"
          label="Delete from Library"
          destructive
          onClick={async () => {
            const ok = await confirmAction({
              title: `Delete “${t.title}”?`,
              message: 'The song is removed from this device and from all playlists. Your original file isn’t affected.',
              confirmLabel: 'Delete',
              destructive: true,
            })
            if (!ok) return
            forgetTracks([t.id])
            await deleteTracks([t.id])
            showToast('Song deleted')
          }}
        />
      </div>
    </SheetFrame>
  )
}

function AddToPlaylist({ sheet }: { sheet: Extract<Sheet, { kind: 'addToPlaylist' }> }) {
  const playlists = useLibrary((s) => s.playlists)
  const n = sheet.trackIds.length
  const add = async (id: string, name: string) => {
    await addToPlaylist(id, sheet.trackIds)
    closeSheet()
    showToast(n > 1 ? `Added ${plural(n, 'song')} to “${name}”` : `Added to “${name}”`)
  }
  return (
    <SheetFrame onClose={closeSheet} label="Add to playlist">
      <p className="border-b border-line px-5 py-4 font-semibold">Add to Playlist</p>
      <div className="py-1.5">
        <Item
          icon="plus"
          label="New Playlist…"
          onClick={async () => {
            const name = await promptText({ title: 'New Playlist', placeholder: 'Playlist name', confirmLabel: 'Create' })
            if (!name) return
            const p = await createPlaylist(name, sheet.trackIds)
            showToast(`Added to “${p.name}”`)
          }}
        />
        {playlists.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => void add(p.id, p.name)}
            className="flex min-h-12 w-full items-center justify-between gap-3 px-5 text-left text-[16px] hover:bg-surface-2"
          >
            <span className="truncate">{p.name}</span>
            <span className="shrink-0 text-sm text-ink-3">{p.trackIds.length}</span>
          </button>
        ))}
      </div>
    </SheetFrame>
  )
}

function Prompt({ sheet }: { sheet: Extract<Sheet, { kind: 'prompt' }> }) {
  const [value, setValue] = useState(sheet.initial ?? '')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])
  return (
    <SheetFrame onClose={() => sheet.resolve(null)} label={sheet.title}>
      <form
        className="p-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim()) sheet.resolve(value.trim())
        }}
      >
        <p className="mb-3 font-semibold">{sheet.title}</p>
        <input
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={sheet.placeholder}
          enterKeyHint="done"
          className="w-full rounded-xl bg-surface-2 px-3.5 py-3 text-[16px] outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-accent"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => sheet.resolve(null)} className="rounded-xl px-4 py-2.5 text-[15px] text-ink-2">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="rounded-xl bg-accent px-4 py-2.5 text-[15px] font-semibold text-accent-ink disabled:opacity-40"
          >
            {sheet.confirmLabel}
          </button>
        </div>
      </form>
    </SheetFrame>
  )
}

function Confirm({ sheet }: { sheet: Extract<Sheet, { kind: 'confirm' }> }) {
  return (
    <SheetFrame onClose={() => sheet.resolve(false)} label={sheet.title}>
      <div className="p-5">
        <p className="font-semibold">{sheet.title}</p>
        {sheet.message && <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{sheet.message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => sheet.resolve(false)} className="rounded-xl px-4 py-2.5 text-[15px] text-ink-2">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => sheet.resolve(true)}
            className={`rounded-xl px-4 py-2.5 text-[15px] font-semibold ${
              sheet.destructive ? 'bg-red-500 text-white' : 'bg-accent text-accent-ink'
            }`}
          >
            {sheet.confirmLabel}
          </button>
        </div>
      </div>
    </SheetFrame>
  )
}

export function SheetHost() {
  const sheet = useStore(ui, (s) => s.sheet)
  if (!sheet) return null
  switch (sheet.kind) {
    case 'track':
      return <TrackActions sheet={sheet} />
    case 'addToPlaylist':
      return <AddToPlaylist sheet={sheet} />
    case 'prompt':
      return <Prompt key={sheet.title} sheet={sheet} />
    case 'confirm':
      return <Confirm sheet={sheet} />
  }
}
