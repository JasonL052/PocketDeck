import { canPickOutput, pickOutput } from '../lib/player'
import { openNowPlaying } from '../lib/ui'
import { Artwork } from './Artwork'
import { Icon } from './Icon'
import { Scrubber, TransportButtons, useCurrentTrack, VolumeSlider } from './PlayerControls'

/** Desktop / iPad player bar spanning the bottom of the grid. */
export function PlayerBar() {
  const t = useCurrentTrack()
  return (
    <footer
      className="col-span-2 hidden h-24 items-center gap-6 border-t border-line bg-surface px-4 md:flex"
      data-chrome
      aria-label="Player"
    >
      <button
        type="button"
        onClick={() => t && openNowPlaying()}
        disabled={!t}
        className="flex w-72 min-w-0 items-center gap-3 text-left"
        aria-label="Open Now Playing"
      >
        <Artwork artId={t?.artId} className="size-13" />
        <span className="min-w-0">
          <span className={`block truncate text-sm font-semibold ${t ? '' : 'font-medium text-ink-2'}`}>{t ? t.title : 'Not Playing'}</span>
          {t && <span className="block truncate text-[13px] text-ink-2">{[t.artist || 'Unknown Artist', t.album].filter(Boolean).join(' · ')}</span>}
        </span>
      </button>

      <div className="flex max-w-2xl flex-1 flex-col items-center">
        <TransportButtons />
        <Scrubber className="-mt-1 w-full" />
      </div>

      <div className="flex w-72 items-center justify-end gap-2">
        {canPickOutput() && (
          <button type="button" onClick={pickOutput} aria-label="AirPlay" className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
            <Icon name="airplay" size={18} />
          </button>
        )}
        <button
          type="button"
          onClick={() => openNowPlaying('queue')}
          disabled={!t}
          aria-label="Queue"
          className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-2 disabled:opacity-30"
        >
          <Icon name="queue" size={18} />
        </button>
        <VolumeSlider className="w-32" />
      </div>
    </footer>
  )
}
