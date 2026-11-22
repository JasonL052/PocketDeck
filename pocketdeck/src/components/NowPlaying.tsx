import { useEffect, useRef, useState, type TouchEvent } from 'react'
import { useArtUrl } from '../lib/artwork'
import { albumArtistOf, albumIdOf, artistIdOf, useLibrary } from '../lib/library'
import { isIOS } from '../lib/platform'
import { canPickOutput, jumpTo, pickOutput, usePlayer } from '../lib/player'
import { navigate } from '../lib/router'
import { useStore } from '../lib/store'
import { closeNowPlaying, openSheet, ui } from '../lib/ui'
import { Artwork } from './Artwork'
import { Icon } from './Icon'
import { Scrubber, TransportButtons, useCurrentTrack, VolumeSlider } from './PlayerControls'

function QueuePanel() {
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const context = usePlayer((s) => s.context)
  const byId = useLibrary((s) => s.byId)
  const upNext = queue.slice(index + 1)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {context && (
        <p className="px-1 pb-1 text-xs font-semibold tracking-wide text-ink-3 uppercase">
          Playing from{' '}
          <button
            type="button"
            className="text-ink-2 uppercase underline-offset-2 hover:underline"
            onClick={() => {
              closeNowPlaying()
              navigate(context.path)
            }}
          >
            {context.label}
          </button>
        </p>
      )}
      <p className="px-1 pt-3 pb-2 font-display text-lg font-semibold">Up Next</p>
      {upNext.length === 0 && <p className="px-1 py-6 text-sm text-ink-3">Nothing else queued.</p>}
      <ul>
        {upNext.map((id, k) => {
          const t = byId.get(id)
          if (!t) return null
          const qi = index + 1 + k
          return (
            <li key={`${id}:${qi}`} className="flex items-center gap-3 py-1.5">
              <button type="button" onClick={() => jumpTo(qi)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Artwork artId={t.artId} className="size-10" iconSize={16} />
                <span className="min-w-0">
                  <span className="block truncate text-[15px]">{t.title}</span>
                  <span className="block truncate text-[13px] text-ink-2">{t.artist || 'Unknown Artist'}</span>
                </span>
              </button>
              <button
                type="button"
                aria-label={`More actions for ${t.title}`}
                onClick={() => openSheet({ kind: 'track', trackId: id, context: { kind: 'queue', index: qi } })}
                className="grid size-9 place-items-center rounded-full text-ink-2"
              >
                <Icon name="more" size={18} />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Full-screen Now Playing. Swipe down (or tap the chevron / press Esc) to close. */
export function NowPlaying() {
  const open = useStore(ui, (s) => s.nowPlaying)
  const view = useStore(ui, (s) => s.nowPlayingView)
  const t = useCurrentTrack()
  const status = usePlayer((s) => s.status)
  const bg = useArtUrl(t?.artId, 'full')
  const [dragY, setDragY] = useState(0)
  const startY = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !ui.get().sheet) closeNowPlaying()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open && !t) closeNowPlaying()
  }, [open, t])

  if (!open || !t) return null

  const onTouchStart = (e: TouchEvent) => {
    startY.current = e.touches[0]!.clientY
  }
  const onTouchMove = (e: TouchEvent) => {
    if (startY.current == null) return
    setDragY(Math.max(0, e.touches[0]!.clientY - startY.current))
  }
  const onTouchEnd = () => {
    if (dragY > 110) closeNowPlaying()
    setDragY(0)
    startY.current = null
  }

  const goAlbum = () => {
    closeNowPlaying()
    navigate(`/albums/${encodeURIComponent(albumIdOf(t))}`)
  }
  const goArtist = () => {
    closeNowPlaying()
    navigate(`/artists/${encodeURIComponent(artistIdOf(albumArtistOf(t)))}`)
  }

  return (
    <div
      className="pd-sheet-in fixed inset-0 z-40 flex flex-col overflow-hidden bg-bg"
      style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragY ? 'none' : 'transform 0.25s' }}
      role="dialog"
      aria-modal="true"
      aria-label="Now Playing"
    >
      {/* Ambient background from the artwork */}
      {bg && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <img src={bg} alt="" className="size-full scale-125 object-cover opacity-45 blur-3xl saturate-150" />
          <div className="absolute inset-0 bg-gradient-to-b from-bg/30 via-bg/60 to-bg" />
        </div>
      )}

      <div className="relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-6 pt-safe pb-safe md:max-w-lg">
        <div
          className="flex shrink-0 items-center justify-between py-2"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <button type="button" onClick={closeNowPlaying} aria-label="Close Now Playing" className="-ml-2 grid size-11 place-items-center rounded-full text-ink-2">
            <Icon name="chevronDown" size={28} />
          </button>
          <div className="h-1.5 w-10 rounded-full bg-ink-3/40" />
          <button
            type="button"
            onClick={() => openSheet({ kind: 'track', trackId: t.id, context: { kind: 'library' } })}
            aria-label="More actions"
            className="-mr-2 grid size-11 place-items-center rounded-full text-ink-2"
          >
            <Icon name="more" size={24} />
          </button>
        </div>

        {view === 'art' ? (
          <div
            className="flex min-h-0 flex-1 items-center justify-center py-4"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <Artwork
              artId={t.artId}
              variant="full"
              iconSize={64}
              rounded="rounded-2xl"
              className={`aspect-square w-full max-w-[min(100%,46dvh)] shadow-2xl shadow-black/40 transition-transform duration-500 ${
                status === 'playing' ? 'scale-100' : 'scale-[0.86]'
              }`}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col py-3">
            <div className="mb-3 flex shrink-0 items-center gap-3">
              <Artwork artId={t.artId} className="size-14" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{t.title}</p>
                <p className="truncate text-sm text-ink-2">{t.artist || 'Unknown Artist'}</p>
              </div>
            </div>
            <QueuePanel />
          </div>
        )}

        <div className="shrink-0 pb-4">
          {view === 'art' && (
            <div className="mb-3 min-w-0">
              <p className="truncate font-display text-[22px] leading-tight font-bold tracking-tight">{t.title}</p>
              <p className="mt-0.5 truncate text-[17px] text-ink-2">
                <button type="button" onClick={goArtist} className="hover:underline">
                  {t.artist || 'Unknown Artist'}
                </button>
                {t.album && (
                  <>
                    {' · '}
                    <button type="button" onClick={goAlbum} className="hover:underline">
                      {t.album}
                    </button>
                  </>
                )}
              </p>
            </div>
          )}
          <Scrubber />
          <div className="mt-2">
            <TransportButtons big />
          </div>
          <div className="mt-5 flex items-center justify-between gap-4">
            {!isIOS() ? <VolumeSlider className="max-w-48 flex-1" /> : <span />}
            <div className="flex items-center gap-1">
              {canPickOutput() && (
                <button type="button" onClick={pickOutput} aria-label="AirPlay" className="grid size-11 place-items-center rounded-full text-ink-2">
                  <Icon name="airplay" size={22} />
                </button>
              )}
              <button
                type="button"
                onClick={() => ui.set({ nowPlayingView: view === 'art' ? 'queue' : 'art' })}
                aria-label={view === 'art' ? 'Show queue' : 'Show artwork'}
                aria-pressed={view === 'queue'}
                className={`grid size-11 place-items-center rounded-full ${view === 'queue' ? 'bg-accent/15 text-accent' : 'text-ink-2'}`}
              >
                <Icon name="queue" size={22} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
