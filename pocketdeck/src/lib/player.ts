/**
 * Audio engine: one long-lived <audio> element driven by a queue.
 *
 * Design notes (see plan §4):
 *  - No Web Audio graph; plain element = most reliable background/lock-screen playback on iOS.
 *  - UI state only follows real element events (playing/pause/ended/error), so phone calls,
 *    Siri, AirPods removal etc. are reflected correctly.
 *  - The next track's blob URL is prefetched while the current one plays, so `ended` can swap
 *    `src` and call play() synchronously (an IndexedDB await there can fail while locked).
 *  - At most two audio object URLs are alive (current + prefetched); old ones are revoked.
 *  - iOS 26 Home Screen apps can fail to resume an element after being reopened; a watchdog
 *    recreates the element and retries.
 */
import { loadArtUrl } from './artwork'
import { kvGet, kvSet } from './db'
import { getAudioBlob, library, updateTrack, type Track } from './library'
import { createStore, useStore } from './store'

export type RepeatMode = 'off' | 'all' | 'one'
export type Status = 'idle' | 'loading' | 'playing' | 'paused'

export interface QueueContext {
  label: string
  path: string
}

interface PlayerState {
  queue: string[]
  /** Unshuffled order, kept while shuffle is on so it can be restored. */
  original: string[] | null
  index: number
  currentId: string | null
  status: Status
  shuffle: boolean
  repeat: RepeatMode
  duration: number
  volume: number
  context: QueueContext | null
  message: string | null
}

export const player = createStore<PlayerState>({
  queue: [],
  original: null,
  index: -1,
  currentId: null,
  status: 'idle',
  shuffle: false,
  repeat: 'off',
  duration: 0,
  volume: 1,
  context: null,
  message: null,
})

/** Position lives in its own store: it changes ~4×/s and only the scrubbers need it. */
export const playhead = createStore({ position: 0 })

export const usePlayer = <S,>(sel: (s: PlayerState) => S) => useStore(player, sel)
export const usePosition = () => useStore(playhead, (s) => s.position)

/* ------------------------------------------------------------------ */
/* Element + URL management                                            */
/* ------------------------------------------------------------------ */

let el: HTMLAudioElement
let currentUrl: string | null = null
let prefetched: { id: string; url: string } | null = null
let pendingSeek: number | null = null
let consecutiveErrors = 0
let watchdog: ReturnType<typeof setTimeout> | null = null
let silentUrl: string | null = null

function makeElement(): HTMLAudioElement {
  const a = document.createElement('audio')
  a.preload = 'auto'
  a.setAttribute('x-webkit-airplay', 'allow')
  a.setAttribute('playsinline', '')
  a.style.display = 'none'
  a.volume = player.get().volume
  a.addEventListener('playing', onPlaying)
  a.addEventListener('pause', onPause)
  a.addEventListener('ended', onEnded)
  a.addEventListener('error', onError)
  a.addEventListener('timeupdate', onTimeUpdate)
  a.addEventListener('loadedmetadata', onLoadedMetadata)
  a.addEventListener('durationchange', onLoadedMetadata)
  a.addEventListener('seeked', syncPositionState)
  document.body.appendChild(a)
  return a
}

function element() {
  el ??= makeElement()
  return el
}

/** Swap in a fresh element (iOS 26 resume bug workaround), preserving src and position. */
function recreateElement() {
  const old = el
  const src = old?.currentSrc || old?.src
  const t = old?.currentTime ?? 0
  if (old) {
    old.removeEventListener('playing', onPlaying)
    old.removeEventListener('pause', onPause)
    old.removeEventListener('ended', onEnded)
    old.removeEventListener('error', onError)
    old.removeEventListener('timeupdate', onTimeUpdate)
    old.removeEventListener('loadedmetadata', onLoadedMetadata)
    old.removeEventListener('durationchange', onLoadedMetadata)
    old.removeEventListener('seeked', syncPositionState)
    old.pause()
    old.remove()
  }
  el = makeElement()
  if (src) {
    pendingSeek = t
    el.src = src
  }
}

/** A tiny silent WAV used to "unlock" the element inside a user gesture on iOS. */
function getSilentUrl() {
  if (silentUrl) return silentUrl
  const samples = 800
  const buf = new ArrayBuffer(44 + samples * 2)
  const v = new DataView(buf)
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); w(8, 'WAVE'); w(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, samples * 2, true)
  silentUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
  return silentUrl
}

let unlocked = false
/**
 * Must be called synchronously inside a tap/click handler. Playing (anything) on the element
 * during a gesture lifts WebKit's autoplay restriction for that element, so the async
 * IndexedDB read that follows can still start playback.
 */
function unlock() {
  const a = element()
  if (unlocked) return
  unlocked = true
  if (!a.src) {
    a.src = getSilentUrl()
    a.play().catch(() => {})
  }
}

function setSource(url: string) {
  const a = element()
  const old = currentUrl
  a.src = url
  currentUrl = url
  if (old && old !== url) URL.revokeObjectURL(old)
}

function dropPrefetch() {
  if (prefetched) URL.revokeObjectURL(prefetched.url)
  prefetched = null
}

/* ------------------------------------------------------------------ */
/* Queue helpers                                                       */
/* ------------------------------------------------------------------ */

function trackOf(id: string | null): Track | undefined {
  return id ? library.get().byId.get(id) : undefined
}

function nextIndex(): number {
  const { index, queue, repeat } = player.get()
  if (index + 1 < queue.length) return index + 1
  return repeat === 'all' && queue.length ? 0 : -1
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

async function schedulePrefetch() {
  const ni = nextIndex()
  const id = ni >= 0 ? player.get().queue[ni] : undefined
  if (!id || id === player.get().currentId) return dropPrefetch()
  if (prefetched?.id === id) return
  dropPrefetch()
  const blob = await getAudioBlob(id).catch(() => undefined)
  // Queue may have changed while we were reading.
  const still = nextIndex() >= 0 ? player.get().queue[nextIndex()] : undefined
  if (!blob || still !== id) return
  dropPrefetch()
  prefetched = { id, url: URL.createObjectURL(blob) }
}

/* ------------------------------------------------------------------ */
/* Loading + playing                                                   */
/* ------------------------------------------------------------------ */

let loadToken = 0

async function loadIndex(i: number, { autoplay, startAt = 0 }: { autoplay: boolean; startAt?: number }) {
  const { queue } = player.get()
  const id = queue[i]
  if (!id) return
  const token = ++loadToken
  player.set({ index: i, currentId: id, status: 'loading', message: null })
  playhead.set({ position: startAt })
  updateMediaSession(trackOf(id))

  let url: string
  if (prefetched?.id === id) {
    url = prefetched.url
    prefetched = null
  } else {
    const blob = await getAudioBlob(id).catch(() => undefined)
    if (token !== loadToken) return
    if (!blob) {
      player.set({ status: 'paused', message: 'This song’s audio is missing. Try re-importing it.' })
      return skipAfterError()
    }
    url = URL.createObjectURL(blob)
  }
  if (token !== loadToken) {
    URL.revokeObjectURL(url)
    return
  }

  pendingSeek = startAt > 0 ? startAt : null
  setSource(url)
  if (autoplay) await tryPlay()
  else player.set({ status: 'paused' })
  void persistSoon()
}

async function tryPlay() {
  const a = element()
  if (watchdog) clearTimeout(watchdog)
  try {
    await a.play()
  } catch (e) {
    const name = (e as DOMException)?.name
    if (name === 'AbortError') return // superseded by another load
    if (name === 'NotAllowedError') {
      player.set({ status: 'paused' })
      return
    }
    // Unknown failure: try once with a fresh element.
    recreateElement()
    try {
      await el.play()
    } catch {
      player.set({ status: 'paused' })
    }
    return
  }
  // Watchdog: play() resolved but the element never actually started (iOS 26 reopen bug).
  watchdog = setTimeout(() => {
    if (el.paused && player.get().status !== 'paused') {
      recreateElement()
      el.play().catch(() => player.set({ status: 'paused' }))
    }
  }, 2500)
}

/* ------------------------------------------------------------------ */
/* Element events                                                      */
/* ------------------------------------------------------------------ */

function onPlaying() {
  if (watchdog) clearTimeout(watchdog)
  if (el.src === silentUrl) return
  consecutiveErrors = 0
  player.set({ status: 'playing' })
  setPlaybackState('playing')
  syncPositionState()
  void schedulePrefetch()
}

function onPause() {
  if (el.src === silentUrl) return
  if (player.get().status === 'loading') return
  player.set({ status: 'paused' })
  setPlaybackState('paused')
  syncPositionState()
  void persistNow()
}

function onLoadedMetadata() {
  if (el.src === silentUrl) return
  const d = el.duration
  if (Number.isFinite(d) && d > 0) {
    player.set({ duration: d })
    const t = trackOf(player.get().currentId)
    if (t && Math.abs((t.durationSec || 0) - d) > 1.5) void updateTrack(t.id, { durationSec: d })
  }
  if (pendingSeek != null) {
    try {
      el.currentTime = pendingSeek
    } catch {
      /* ignore */
    }
    pendingSeek = null
  }
  syncPositionState()
}

let lastPersist = 0
function onTimeUpdate() {
  if (el.src === silentUrl) return
  playhead.set({ position: el.currentTime })
  if (Date.now() - lastPersist > 5000) void persistNow()
}

function onEnded() {
  if (el.src === silentUrl) return
  const { currentId, repeat, queue } = player.get()
  const t = trackOf(currentId)
  if (t) void updateTrack(t.id, { playCount: (t.playCount || 0) + 1, lastPlayedAt: Date.now() })

  if (repeat === 'one') {
    el.currentTime = 0
    void tryPlay()
    return
  }
  const ni = nextIndex()
  if (ni < 0) {
    // End of queue: stop at the start of the last track.
    player.set({ status: 'paused' })
    el.currentTime = 0
    playhead.set({ position: 0 })
    setPlaybackState('paused')
    return
  }
  const nextId = queue[ni]!
  if (prefetched?.id === nextId) {
    // Synchronous swap: the reliable path while the screen is locked.
    const url = prefetched.url
    prefetched = null
    player.set({ index: ni, currentId: nextId, status: 'loading' })
    playhead.set({ position: 0 })
    setSource(url)
    void tryPlay()
    updateMediaSession(trackOf(nextId))
    void persistSoon()
  } else {
    void loadIndex(ni, { autoplay: true })
  }
}

function onError() {
  if (el.src === silentUrl || !el.src) return
  const code = el.error?.code
  const id = player.get().currentId
  const t = trackOf(id)
  if (t && (code === 3 || code === 4)) void updateTrack(t.id, { playable: false })
  player.set({
    status: 'paused',
    message: t ? `Can’t play “${t.title}” on this device.` : 'Playback error.',
  })
  skipAfterError()
}

function skipAfterError() {
  consecutiveErrors++
  const ni = nextIndex()
  if (consecutiveErrors <= 3 && ni >= 0 && ni !== player.get().index) void loadIndex(ni, { autoplay: true })
}

/* ------------------------------------------------------------------ */
/* Media Session (lock screen, Control Center, AirPods, keyboard keys) */
/* ------------------------------------------------------------------ */

const ms = typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null
let artToken = 0

function updateMediaSession(t: Track | undefined) {
  if (!ms) return
  if (!t) {
    ms.metadata = null
    return
  }
  const base = { title: t.title, artist: t.artist || t.albumArtist || 'Unknown Artist', album: t.album }
  ms.metadata = new MediaMetadata(base)
  const token = ++artToken
  if (t.artId) {
    void loadArtUrl(t.artId, 'full').then((src) => {
      if (!src || token !== artToken) return
      ms.metadata = new MediaMetadata({ ...base, artwork: [{ src, sizes: '640x640', type: 'image/jpeg' }] })
    })
  }
}

function setPlaybackState(s: MediaSessionPlaybackState) {
  if (ms) ms.playbackState = s
}

function syncPositionState() {
  if (!ms?.setPositionState || !el) return
  const d = el.duration
  if (!Number.isFinite(d) || d <= 0) return
  try {
    ms.setPositionState({ duration: d, position: Math.min(el.currentTime, d), playbackRate: el.playbackRate || 1 })
  } catch {
    /* ignore */
  }
}

function registerMediaSession() {
  if (!ms) return
  const set = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
    try {
      ms.setActionHandler(a, h)
    } catch {
      /* unsupported action */
    }
  }
  set('play', () => void play())
  set('pause', () => pause())
  set('previoustrack', () => previous())
  set('nexttrack', () => next())
  set('seekto', (d) => d.seekTime != null && seek(d.seekTime))
  // Deliberately NOT registering seekbackward/seekforward: on iOS they replace the
  // previous/next track buttons on the lock screen with ±10 s.
  set('seekbackward', null)
  set('seekforward', null)
}

/* ------------------------------------------------------------------ */
/* Session persistence                                                 */
/* ------------------------------------------------------------------ */

interface SavedSession {
  queue: string[]
  original: string[] | null
  index: number
  position: number
  shuffle: boolean
  repeat: RepeatMode
  context: QueueContext | null
}

async function persistNow() {
  lastPersist = Date.now()
  const s = player.get()
  const session: SavedSession = {
    queue: s.queue,
    original: s.original,
    index: s.index,
    position: el && el.src !== silentUrl ? el.currentTime : playhead.get().position,
    shuffle: s.shuffle,
    repeat: s.repeat,
    context: s.context,
  }
  await kvSet('session', session).catch(() => {})
}

let persistTimer: ReturnType<typeof setTimeout> | null = null
function persistSoon() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => void persistNow(), 400)
}

/** Restore last queue/position (paused). Call once after the library has loaded. */
export async function initPlayer() {
  element()
  registerMediaSession()
  const vol = await kvGet<number>('volume').catch(() => undefined)
  if (vol != null) {
    player.set({ volume: vol })
    el.volume = vol
  }

  const s = await kvGet<SavedSession>('session').catch(() => undefined)
  if (s?.queue?.length) {
    const known = library.get().byId
    const queue = s.queue.filter((id) => known.has(id))
    const currentId = s.queue[s.index]
    const index = currentId ? queue.indexOf(currentId) : -1
    if (queue.length && index >= 0) {
      player.set({
        queue,
        original: s.original?.filter((id) => known.has(id)) ?? null,
        index,
        currentId: queue[index]!,
        status: 'paused',
        shuffle: s.shuffle,
        repeat: s.repeat,
        context: s.context,
        duration: known.get(queue[index]!)?.durationSec ?? 0,
      })
      playhead.set({ position: s.position || 0 })
      updateMediaSession(trackOf(queue[index]!))
    }
  }

  window.addEventListener('pagehide', () => void persistNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void persistNow()
    // Coming back: make the UI match reality (iOS may have paused us while suspended).
    else if (el && el.paused && player.get().status === 'playing') player.set({ status: 'paused' })
  })
}

/* ------------------------------------------------------------------ */
/* Public API (call from click/tap handlers)                           */
/* ------------------------------------------------------------------ */

/** Replace the queue with `ids` and start at `start`. */
export function playTracks(ids: string[], start = 0, opts: { shuffle?: boolean; context?: QueueContext } = {}) {
  if (!ids.length) return
  unlock()
  dropPrefetch()
  const shuffle = opts.shuffle ?? player.get().shuffle
  let queue = ids
  let index = Math.max(0, Math.min(start, ids.length - 1))
  if (shuffle) {
    const first = opts.shuffle && start === 0 ? ids[Math.floor(Math.random() * ids.length)]! : ids[index]!
    queue = [first, ...shuffled(ids.filter((_, i) => i !== ids.indexOf(first)))]
    index = 0
  }
  player.set({ queue, original: shuffle ? ids : null, shuffle, index, context: opts.context ?? null })
  void loadIndex(index, { autoplay: true })
}

export async function play() {
  unlock()
  const s = player.get()
  if (s.index < 0) {
    const all = library.get().tracks.map((t) => t.id)
    if (all.length) playTracks(all, 0, { context: { label: 'Songs', path: '/songs' } })
    return
  }
  const a = element()
  if (!currentUrl || a.src === silentUrl) {
    await loadIndex(s.index, { autoplay: true, startAt: playhead.get().position })
    return
  }
  await tryPlay()
}

export function pause() {
  el?.pause()
}

export function togglePlay() {
  const st = player.get().status
  if (st === 'playing' || st === 'loading') pause()
  else void play()
}

export function next() {
  unlock()
  const ni = nextIndex()
  if (ni >= 0) void loadIndex(ni, { autoplay: true })
  else if (player.get().queue.length) {
    // At the end with repeat off: go to the start of the last track, paused.
    pause()
    seek(0)
  }
}

export function previous() {
  unlock()
  const { index, queue, repeat } = player.get()
  const pos = el?.currentTime ?? 0
  if (pos > 3 || index < 0) return seek(0)
  if (index > 0) void loadIndex(index - 1, { autoplay: true })
  else if (repeat === 'all' && queue.length > 1) void loadIndex(queue.length - 1, { autoplay: true })
  else seek(0)
}

export function seek(sec: number) {
  const a = element()
  const d = Number.isFinite(a.duration) ? a.duration : player.get().duration
  const t = Math.max(0, Math.min(sec, d || sec))
  if (!currentUrl || a.src === silentUrl) {
    playhead.set({ position: t })
    return
  }
  a.currentTime = t
  playhead.set({ position: t })
  syncPositionState()
}

export function jumpTo(index: number) {
  unlock()
  if (index >= 0 && index < player.get().queue.length) void loadIndex(index, { autoplay: true })
}

export function setShuffle(on: boolean) {
  const s = player.get()
  if (on === s.shuffle) return
  if (on) {
    const rest = s.queue.filter((_, i) => i !== s.index)
    const queue = s.currentId ? [s.currentId, ...shuffled(rest)] : shuffled(s.queue)
    player.set({ shuffle: true, original: s.queue, queue, index: s.currentId ? 0 : -1 })
  } else {
    const queue = s.original ?? s.queue
    player.set({ shuffle: false, original: null, queue, index: s.currentId ? queue.indexOf(s.currentId) : -1 })
  }
  void schedulePrefetch()
  persistSoon()
}

export function cycleRepeat() {
  const order: RepeatMode[] = ['off', 'all', 'one']
  const r = player.get().repeat
  player.set({ repeat: order[(order.indexOf(r) + 1) % order.length]! })
  void schedulePrefetch()
  persistSoon()
}

export function playNext(ids: string[]) {
  const s = player.get()
  if (s.index < 0) return playTracks(ids, 0)
  const queue = [...s.queue]
  queue.splice(s.index + 1, 0, ...ids)
  player.set({ queue, original: s.original ? [...s.original, ...ids] : null, message: null })
  void schedulePrefetch()
  persistSoon()
}

export function addToQueue(ids: string[]) {
  const s = player.get()
  if (s.index < 0) return playTracks(ids, 0)
  player.set({ queue: [...s.queue, ...ids], original: s.original ? [...s.original, ...ids] : null })
  void schedulePrefetch()
  persistSoon()
}

export function removeFromQueue(index: number) {
  const s = player.get()
  if (index === s.index || index < 0 || index >= s.queue.length) return
  const removed = s.queue[index]!
  const queue = s.queue.filter((_, i) => i !== index)
  const original = s.original ? (() => {
    const o = [...s.original]
    const at = o.indexOf(removed)
    if (at >= 0) o.splice(at, 1)
    return o
  })() : null
  player.set({ queue, original, index: index < s.index ? s.index - 1 : s.index })
  void schedulePrefetch()
  persistSoon()
}

export function setVolume(v: number) {
  const vol = Math.max(0, Math.min(1, v))
  element().volume = vol
  player.set({ volume: vol })
  void kvSet('volume', vol).catch(() => {})
}

export function dismissMessage() {
  player.set({ message: null })
}

/** Called after tracks are deleted from the library. */
export function forgetTracks(ids: string[]) {
  const drop = new Set(ids)
  const s = player.get()
  if (!s.queue.some((id) => drop.has(id))) return
  const currentDropped = s.currentId && drop.has(s.currentId)
  if (currentDropped) {
    el?.pause()
    el?.removeAttribute('src')
    el?.load()
    if (currentUrl) URL.revokeObjectURL(currentUrl)
    currentUrl = null
  }
  dropPrefetch()
  const queue = s.queue.filter((id) => !drop.has(id))
  const original = s.original?.filter((id) => !drop.has(id)) ?? null
  if (currentDropped) {
    player.set({ queue, original, index: -1, currentId: null, status: 'idle', duration: 0 })
    playhead.set({ position: 0 })
    updateMediaSession(undefined)
  } else {
    player.set({ queue, original, index: s.currentId ? queue.indexOf(s.currentId) : -1 })
  }
  persistSoon()
}

/** AirPlay / audio route picker (Safari only). */
export function canPickOutput() {
  return typeof HTMLMediaElement !== 'undefined' && 'webkitShowPlaybackTargetPicker' in HTMLMediaElement.prototype
}
export function pickOutput() {
  ;(element() as HTMLAudioElement & { webkitShowPlaybackTargetPicker?: () => void }).webkitShowPlaybackTargetPicker?.()
}

/** Test hook (dev only): expose the element for automation. */
export function __element() {
  return element()
}
