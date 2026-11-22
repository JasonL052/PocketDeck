import { next, usePlayer, usePosition } from '../lib/player'
import { openNowPlaying } from '../lib/ui'
import { Artwork } from './Artwork'
import { Icon } from './Icon'
import { PlayPauseButton, useCurrentTrack, useDuration } from './PlayerControls'

/** iPhone mini-player docked above the tab bar. Tap anywhere (except buttons) to open Now Playing. */
export function MiniPlayer() {
  const t = useCurrentTrack()
  const position = usePosition()
  const duration = useDuration()
  const hasQueue = usePlayer((s) => s.queue.length > 0)
  const pct = duration ? Math.min(100, (position / duration) * 100) : 0

  return (
    <div className="relative border-t border-line bg-surface/90 px-safe backdrop-blur-xl backdrop-saturate-150">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-transparent">
        <div className="h-full bg-accent transition-[width] duration-200 ease-linear" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex h-mini items-center gap-3 px-3">
        <button
          type="button"
          onClick={() => t && openNowPlaying()}
          disabled={!t}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label="Open Now Playing"
        >
          <Artwork artId={t?.artId} className="size-11" rounded="rounded-md" iconSize={18} />
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[15px] font-medium ${t ? 'text-ink' : 'text-ink-2'}`}>
              {t ? t.title : 'Not Playing'}
            </span>
            {t && <span className="block truncate text-[13px] text-ink-2">{t.artist || 'Unknown Artist'}</span>}
          </span>
        </button>
        <PlayPauseButton size="sm" />
        <button
          type="button"
          onClick={next}
          disabled={!hasQueue}
          aria-label="Next track"
          className="grid size-11 place-items-center rounded-full text-ink disabled:opacity-30"
        >
          <Icon name="next" size={22} />
        </button>
      </div>
    </div>
  )
}
