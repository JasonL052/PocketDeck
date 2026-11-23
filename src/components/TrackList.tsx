import type { ReactNode } from 'react'
import type { Track } from '../lib/library'
import { playTracks, usePlayer, type QueueContext } from '../lib/player'
import { formatTime } from '../lib/text'
import { openSheet, type TrackMenuContext } from '../lib/ui'
import { Artwork } from './Artwork'
import { Icon } from './Icon'
import { VirtualList } from './VirtualList'

export const ROW_H = 60

function NowPlayingBars() {
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-label="Now playing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="pd-eq w-[3px] rounded-sm bg-accent"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </span>
  )
}

export function TrackRow({
  track,
  variant,
  active,
  playing,
  onPlay,
  onMore,
  trailing,
}: {
  track: Track
  variant: 'songs' | 'album' | 'playlist'
  active: boolean
  playing: boolean
  onPlay: () => void
  onMore: () => void
  trailing?: ReactNode
}) {
  const sub =
    variant === 'album'
      ? track.artist && track.artist !== track.albumArtist
        ? track.artist
        : null
      : [track.artist || 'Unknown Artist', track.album].filter(Boolean).join(' · ')

  return (
    <div
      className={[
        'flex h-full items-center gap-3 px-4 md:px-8',
        !track.playable ? 'opacity-45' : '',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onPlay}
        className="flex h-full min-w-0 flex-1 items-center gap-3 text-left"
        aria-label={`Play ${track.title}`}
      >
        {variant === 'album' ? (
          <span className="grid w-7 shrink-0 place-items-center text-[15px] text-ink-3 tabular-nums">
            {active ? <NowPlayingBars /> : track.trackNo ?? '–'}
          </span>
        ) : (
          <span className="relative">
            <Artwork artId={track.artId} className="size-11" rounded="rounded-[6px]" iconSize={18} />
            {active && (
              <span className="absolute inset-0 grid place-items-center rounded-[6px] bg-black/45">
                {playing ? <NowPlayingBars /> : <Icon name="pause" size={14} className="text-white" />}
              </span>
            )}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col justify-center border-b border-line py-2">
          <span className={`truncate text-[15.5px] leading-tight ${active ? 'font-semibold text-accent' : 'text-ink'}`}>
            {track.title}
          </span>
          {sub && <span className="mt-0.5 truncate text-[13px] leading-tight text-ink-2">{sub}</span>}
        </span>
      </button>
      {trailing}
      <span className="hidden w-12 text-right text-[13px] text-ink-3 tabular-nums sm:block">
        {formatTime(track.durationSec)}
      </span>
      <button
        type="button"
        onClick={onMore}
        aria-label={`More actions for ${track.title}`}
        className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2"
      >
        <Icon name="more" size={20} />
      </button>
    </div>
  )
}

/** A list of tracks that plays in-context: tapping row i queues the whole list from i. */
export function TrackList({
  tracks,
  context,
  variant = 'songs',
  menuContext,
  trailing,
}: {
  tracks: Track[]
  context: QueueContext
  variant?: 'songs' | 'album' | 'playlist'
  menuContext?: (index: number) => TrackMenuContext
  trailing?: (t: Track, i: number) => ReactNode
}) {
  const currentId = usePlayer((s) => s.currentId)
  const status = usePlayer((s) => s.status)
  const ids = tracks.map((t) => t.id)

  return (
    <VirtualList
      items={tracks}
      rowHeight={ROW_H}
      getKey={(t, i) => (variant === 'playlist' ? `${t.id}:${i}` : t.id)}
      render={(t, i) => (
        <TrackRow
          track={t}
          variant={variant}
          active={t.id === currentId}
          playing={status === 'playing'}
          onPlay={() => playTracks(ids, i, { context })}
          onMore={() =>
            openSheet({ kind: 'track', trackId: t.id, context: menuContext?.(i) ?? { kind: 'library' } })
          }
          trailing={trailing?.(t, i)}
        />
      )}
    />
  )
}
