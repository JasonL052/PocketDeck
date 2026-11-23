import { useEffect } from 'react'
import { playTracks, type QueueContext } from '../lib/player'
import { href } from '../lib/router'
import { Artwork } from './Artwork'
import { Icon } from './Icon'
import type { Album } from '../lib/library'

export function PlayShuffle({ ids, context, className = '' }: { ids: string[]; context: QueueContext; className?: string }) {
  const disabled = ids.length === 0
  const btn =
    'flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 py-2.5 text-[15px] font-semibold text-accent disabled:opacity-40 md:flex-none md:px-6'
  return (
    <div className={`flex gap-3 ${className}`}>
      <button type="button" disabled={disabled} className={btn} onClick={() => playTracks(ids, 0, { shuffle: false, context })}>
        <Icon name="play" size={16} />
        Play
      </button>
      <button type="button" disabled={disabled} className={btn} onClick={() => playTracks(ids, 0, { shuffle: true, context })}>
        <Icon name="shuffle" size={17} />
        Shuffle
      </button>
    </div>
  )
}

export function AlbumCard({ album }: { album: Album }) {
  return (
    <a href={href(`/albums/${encodeURIComponent(album.id)}`)} className="group block min-w-0">
      <Artwork artId={album.artId} className="aspect-square w-full shadow-sm" rounded="rounded-lg" iconSize={32} />
      <p className="mt-2 truncate text-[14.5px] leading-tight font-medium group-hover:underline">{album.title}</p>
      <p className="truncate text-[13px] leading-tight text-ink-2">{album.artist}</p>
    </a>
  )
}

export function AlbumGrid({ albums }: { albums: Album[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-4 sm:grid-cols-3 md:px-8 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {albums.map((a) => (
        <AlbumCard key={a.id} album={a} />
      ))}
    </div>
  )
}

export function SettingsLink() {
  return (
    <a href={href('/settings')} aria-label="Settings" className="grid size-10 place-items-center rounded-full text-ink-2 md:hidden">
      <Icon name="settings" size={22} />
    </a>
  )
}

export function NotFound({ what }: { what: string }) {
  return <p className="px-4 py-16 text-center text-ink-3 md:px-8">This {what} isn’t in your library anymore.</p>
}

/** Persisted UI preference (localStorage may throw in some private modes). */
export function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(`pd.${key}`) as T) || fallback
  } catch {
    return fallback
  }
}
export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(`pd.${key}`, value)
  } catch {
    /* ignore */
  }
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · PocketDeck`
  }, [title])
}
