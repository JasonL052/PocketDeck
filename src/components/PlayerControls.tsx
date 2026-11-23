import { useState, type CSSProperties } from 'react'
import { useLibrary } from '../lib/library'
import { cycleRepeat, next, previous, seek, setShuffle, setVolume, togglePlay, usePlayer, usePosition } from '../lib/player'
import { formatTime } from '../lib/text'
import { Icon } from './Icon'

export function useCurrentTrack() {
  const id = usePlayer((s) => s.currentId)
  return useLibrary((s) => (id ? s.byId.get(id) : undefined))
}

export function useDuration() {
  const d = usePlayer((s) => s.duration)
  const t = useCurrentTrack()
  return d > 0 && (!t || Math.abs(d - t.durationSec) < 5 || !t.durationSec) ? d : t?.durationSec ?? 0
}

export function Scrubber({ className = '', showTimes = true }: { className?: string; showTimes?: boolean }) {
  const position = usePosition()
  const duration = useDuration()
  const hasTrack = usePlayer((s) => !!s.currentId)
  const [drag, setDrag] = useState<number | null>(null)
  const value = drag ?? position
  const pct = duration ? Math.min(100, (value / duration) * 100) : 0

  const commit = () => {
    if (drag != null) seek(drag)
    setDrag(null)
  }

  return (
    <div className={className}>
      <input
        type="range"
        className="pd-range block"
        aria-label="Seek"
        min={0}
        max={duration || 1}
        step={0.1}
        value={Math.min(value, duration || 1)}
        disabled={!hasTrack || !duration}
        style={{ '--pd-pct': `${pct}%` } as CSSProperties}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      {showTimes && (
        <div className="-mt-1 flex justify-between text-[11.5px] font-medium text-ink-3 tabular-nums">
          <span>{formatTime(value)}</span>
          <span>−{formatTime(Math.max(0, duration - value))}</span>
        </div>
      )}
    </div>
  )
}

export function PlayPauseButton({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const status = usePlayer((s) => s.status)
  const hasTrack = usePlayer((s) => s.queue.length > 0)
  const playing = status === 'playing' || status === 'loading'
  const dims = size === 'lg' ? 'size-18' : size === 'md' ? 'size-10' : 'size-11'
  const icon = size === 'lg' ? 34 : size === 'md' ? 20 : 24
  const filled = size !== 'sm'
  return (
    <button
      type="button"
      onClick={togglePlay}
      disabled={!hasTrack}
      aria-label={playing ? 'Pause' : 'Play'}
      className={`grid ${dims} shrink-0 place-items-center rounded-full transition-transform active:scale-90 disabled:opacity-30 ${
        filled ? 'bg-ink text-bg' : 'text-ink'
      }`}
    >
      <Icon name={playing ? 'pause' : 'play'} size={icon} className={!playing && filled ? 'translate-x-[1px]' : ''} />
    </button>
  )
}

export function TransportButtons({ big = false }: { big?: boolean }) {
  const hasTrack = usePlayer((s) => s.queue.length > 0)
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const skip = big ? 30 : 20
  return (
    <div className={`flex items-center ${big ? 'justify-between' : 'gap-5'}`}>
      <button
        type="button"
        onClick={() => setShuffle(!shuffle)}
        aria-label="Shuffle"
        aria-pressed={shuffle}
        className={`grid size-10 place-items-center rounded-full ${shuffle ? 'bg-accent/15 text-accent' : 'text-ink-2'}`}
      >
        <Icon name="shuffle" size={big ? 22 : 18} />
      </button>
      <button type="button" onClick={previous} disabled={!hasTrack} aria-label="Previous" className="grid size-12 place-items-center text-ink active:scale-90 disabled:opacity-30">
        <Icon name="prev" size={skip} />
      </button>
      <PlayPauseButton size={big ? 'lg' : 'md'} />
      <button type="button" onClick={next} disabled={!hasTrack} aria-label="Next" className="grid size-12 place-items-center text-ink active:scale-90 disabled:opacity-30">
        <Icon name="next" size={skip} />
      </button>
      <button
        type="button"
        onClick={cycleRepeat}
        aria-label={`Repeat: ${repeat}`}
        aria-pressed={repeat !== 'off'}
        className={`grid size-10 place-items-center rounded-full ${repeat !== 'off' ? 'bg-accent/15 text-accent' : 'text-ink-2'}`}
      >
        <Icon name={repeat === 'one' ? 'repeatOne' : 'repeat'} size={big ? 22 : 18} />
      </button>
    </div>
  )
}

export function VolumeSlider({ className = '' }: { className?: string }) {
  const volume = usePlayer((s) => s.volume)
  return (
    <label className={`flex items-center gap-2 text-ink-3 ${className}`}>
      <Icon name="volume" size={18} />
      <input
        type="range"
        className="pd-range"
        aria-label="Volume"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        style={{ '--pd-pct': `${volume * 100}%`, '--pd-fill': 'var(--pd-ink-2)' } as CSSProperties}
        onChange={(e) => setVolume(Number(e.target.value))}
      />
    </label>
  )
}
