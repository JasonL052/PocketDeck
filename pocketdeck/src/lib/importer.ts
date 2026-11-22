import { makeArtwork, saveArtwork } from './artwork'
import * as db from './db'
import { addTracksToMemory, library, type Track } from './library'
import { CONTAINER_MIME, parseMetadata, SUPPORTED_EXTENSIONS } from './metadata'
import { createStore } from './store'
import { sha256Hex, titleFromFileName, uid } from './text'

export interface ImportIssue {
  name: string
  reason: string
}

interface ImportState {
  active: boolean
  total: number
  done: number
  added: number
  skipped: number
  current: string | null
  issues: ImportIssue[]
  finishedAt: number | null
}

export const importState = createStore<ImportState>({
  active: false,
  total: 0,
  done: 0,
  added: 0,
  skipped: 0,
  current: null,
  issues: [],
  finishedAt: null,
})

/** `accept` attribute: explicit extensions so iOS doesn't grey out FLAC/M4A. */
export const ACCEPT = [...SUPPORTED_EXTENSIONS.map((e) => `.${e}`), 'audio/*'].join(',')

export function isAudioFile(f: File) {
  const ext = f.name.toLowerCase().split('.').pop() ?? ''
  return SUPPORTED_EXTENSIONS.includes(ext) || f.type.startsWith('audio/')
}

const audioProbe = typeof document !== 'undefined' ? document.createElement('audio') : null

export function canPlay(mime: string) {
  if (!audioProbe || !mime) return false
  return audioProbe.canPlayType(mime) !== ''
}

/** Fingerprint: SHA-256 of first 256 KB + total size. Fast, and stable across re-imports. */
function hashHeadAndSize(head: Uint8Array, size: number) {
  const tail = new TextEncoder().encode(`:${size}`)
  const buf = new Uint8Array(head.length + tail.length)
  buf.set(head)
  buf.set(tail, head.length)
  return sha256Hex(buf)
}

async function fingerprint(file: Blob) {
  return hashHeadAndSize(new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer()), file.size)
}

/**
 * Last-resort duration probe via a media element (works on macOS; iOS ignores preload
 * without a gesture, so it may time out; the audio engine fills duration in at play time).
 */
function probeDuration(blob: Blob, ms = 4000): Promise<number> {
  return new Promise((resolve) => {
    const a = document.createElement('audio')
    const url = URL.createObjectURL(blob)
    const finish = (d: number) => {
      clearTimeout(t)
      a.removeAttribute('src')
      a.load()
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(d) ? d : 0)
    }
    const t = setTimeout(() => finish(0), ms)
    a.preload = 'metadata'
    a.onloadedmetadata = () => finish(a.duration)
    a.onerror = () => finish(0)
    a.src = url
  })
}

class QuotaError extends Error {}

async function storeAudio(trackId: string, file: File, mime: string) {
  const write = (blob: Blob) => db.put('audio', { trackId, blob })
  try {
    await write(new Blob([file], { type: mime }))
  } catch (e) {
    if ((e as DOMException)?.name === 'QuotaExceededError') throw new QuotaError('Storage is full')
    // Some WebKit builds refuse to store File-backed blobs from the picker; copy the bytes instead.
    try {
      await write(new Blob([await file.arrayBuffer()], { type: mime }))
    } catch (e2) {
      if ((e2 as DOMException)?.name === 'QuotaExceededError') throw new QuotaError('Storage is full')
      throw e2
    }
  }
}

async function importOne(file: File, knownHashes: Set<string>, knownArt: Set<string>): Promise<Track | 'skipped'> {
  const contentHash = await fingerprint(file)
  if (knownHashes.has(contentHash)) return 'skipped'

  const meta = await parseMetadata(file, file.name)
  const mime = CONTAINER_MIME[meta.container] || file.type || 'audio/mpeg'

  let artId: string | null = null
  if (meta.picture) {
    const pic = meta.picture.data
    artId = await hashHeadAndSize(pic.subarray(0, 64 * 1024), pic.length)
    if (!knownArt.has(artId) && !(await db.has('artThumbs', artId))) {
      const art = await makeArtwork(pic, meta.picture.mime)
      if (art) await saveArtwork(artId, art)
      else artId = null
    }
    if (artId) knownArt.add(artId)
  }

  const playable = canPlay(mime)
  let durationSec = meta.durationSec ?? 0
  if (!durationSec && playable) durationSec = await probeDuration(file)

  const id = uid()
  const track: Track = {
    id,
    title: meta.title || titleFromFileName(file.name),
    artist: meta.artist || '',
    album: meta.album || '',
    albumArtist: meta.albumArtist || '',
    trackNo: meta.trackNo ?? null,
    trackTotal: meta.trackTotal ?? null,
    discNo: meta.discNo ?? null,
    year: meta.year ?? null,
    genre: meta.genre ?? null,
    compilation: !!meta.compilation,
    durationSec,
    codec: meta.codec ?? null,
    container: meta.container,
    sampleRate: meta.sampleRate ?? null,
    bitrate: meta.bitrate ?? null,
    fileName: file.name,
    fileSize: file.size,
    mime,
    artId,
    contentHash,
    playable,
    addedAt: Date.now(),
    playCount: 0,
    lastPlayedAt: null,
  }

  // Audio first, then metadata, so a track record never exists without its audio.
  await storeAudio(id, file, mime)
  try {
    await db.put('tracks', track)
  } catch (e) {
    await db.del('audio', id).catch(() => {})
    throw e
  }
  knownHashes.add(contentHash)
  return track
}

let queue: File[] = []
let running = false

/** Queue files for import. Safe to call while an import is running (files are appended). */
export function importFiles(input: Iterable<File>) {
  const all = [...input]
  const files = all.filter(isAudioFile)
  const rejected = all.filter((f) => !isAudioFile(f))
  const s = importState.get()
  const fresh = !s.active
  importState.set({
    active: true,
    total: (fresh ? 0 : s.total) + files.length,
    done: fresh ? 0 : s.done,
    added: fresh ? 0 : s.added,
    skipped: fresh ? 0 : s.skipped,
    issues: [
      ...(fresh ? [] : s.issues),
      ...rejected.filter((f) => !f.name.startsWith('.')).map((f) => ({ name: f.name, reason: 'Not a supported audio file' })),
    ],
    finishedAt: null,
  })
  queue.push(...files)
  if (!files.length && fresh) importState.set({ active: false, finishedAt: Date.now() })
  if (!running) void run()
}

async function run() {
  running = true
  const knownHashes = new Set(library.get().tracks.map((t) => t.contentHash))
  const knownArt = new Set(library.get().tracks.map((t) => t.artId).filter((x): x is string => !!x))
  let batch: Track[] = []
  let lastFlush = performance.now()

  const flush = () => {
    if (batch.length) addTracksToMemory(batch)
    batch = []
    lastFlush = performance.now()
  }

  while (queue.length) {
    const file = queue.shift()!
    importState.set({ current: file.name })
    try {
      const res = await importOne(file, knownHashes, knownArt)
      if (res === 'skipped') importState.set((s) => ({ skipped: s.skipped + 1 }))
      else {
        batch.push(res)
        importState.set((s) => ({ added: s.added + 1 }))
      }
    } catch (e) {
      const reason = e instanceof QuotaError ? 'Not enough storage space' : e instanceof Error ? e.message : String(e)
      importState.set((s) => ({ issues: [...s.issues, { name: file.name, reason }] }))
      if (e instanceof QuotaError) {
        const left = queue.splice(0)
        importState.set((s) => ({
          issues: [...s.issues, ...left.map((f) => ({ name: f.name, reason: 'Skipped: storage is full' }))],
          done: s.done + left.length,
        }))
      }
    }
    importState.set((s) => ({ done: s.done + 1 }))
    // Update the visible library every ~600ms rather than per file.
    if (performance.now() - lastFlush > 600) flush()
  }
  flush()
  running = false
  importState.set({ active: false, current: null, finishedAt: Date.now() })
}

export function dismissImportReport() {
  importState.set({ issues: [], finishedAt: null, total: 0, done: 0, added: 0, skipped: 0 })
}
