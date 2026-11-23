import * as db from './db'
import { createStore, useStore } from './store'
import { compareText, normalize, sortKey, uid } from './text'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** Lightweight metadata record (~0.5 KB). The audio blob lives in the `audio` store. */
export interface Track {
  id: string
  title: string
  artist: string
  album: string
  albumArtist: string
  trackNo: number | null
  trackTotal: number | null
  discNo: number | null
  year: number | null
  genre: string | null
  compilation: boolean
  durationSec: number
  codec: string | null
  container: string
  sampleRate: number | null
  bitrate: number | null
  fileName: string
  fileSize: number
  mime: string
  artId: string | null
  contentHash: string
  playable: boolean
  addedAt: number
  playCount: number
  lastPlayedAt: number | null
}

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
  createdAt: number
  updatedAt: number
}

/** Albums and artists are derived from tracks in memory (cheap even for thousands). */
export interface Album {
  id: string
  title: string
  artist: string
  year: number | null
  artId: string | null
  trackIds: string[]
  durationSec: number
  sort: string
}

export interface Artist {
  id: string
  name: string
  albumIds: string[]
  trackIds: string[]
  artId: string | null
  sort: string
}

export const UNKNOWN_ARTIST = 'Unknown Artist'
export const UNKNOWN_ALBUM = 'Unknown Album'
export const VARIOUS_ARTISTS = 'Various Artists'

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

interface LibraryState {
  loaded: boolean
  error: string | null
  tracks: Track[]
  byId: Map<string, Track>
  albums: Album[]
  albumById: Map<string, Album>
  artists: Artist[]
  artistById: Map<string, Artist>
  playlists: Playlist[]
  /** Bumped on every change; handy as a cheap dependency. */
  version: number
}

export const library = createStore<LibraryState>({
  loaded: false,
  error: null,
  tracks: [],
  byId: new Map(),
  albums: [],
  albumById: new Map(),
  artists: [],
  artistById: new Map(),
  playlists: [],
  version: 0,
})

export function useLibrary<S>(selector: (s: LibraryState) => S): S {
  return useStore(library, selector)
}

export function albumArtistOf(t: Pick<Track, 'albumArtist' | 'artist' | 'compilation'>) {
  if (t.albumArtist) return t.albumArtist
  if (t.compilation) return VARIOUS_ARTISTS
  return t.artist || UNKNOWN_ARTIST
}

export function albumIdOf(t: Track) {
  return `${normalize(albumArtistOf(t))}|${normalize(t.album || UNKNOWN_ALBUM)}`
}

export function artistIdOf(name: string) {
  return normalize(name) || 'unknown'
}

function compareTracksInAlbum(a: Track, b: Track) {
  return (
    (a.discNo ?? 1) - (b.discNo ?? 1) ||
    (a.trackNo ?? 9999) - (b.trackNo ?? 9999) ||
    compareText(a.title, b.title)
  )
}

function derive(tracks: Track[], playlists: Playlist[]): Omit<LibraryState, 'loaded' | 'error' | 'version'> {
  const sorted = [...tracks].sort((a, b) => compareText(sortKey(a.title), sortKey(b.title)))
  const byId = new Map(sorted.map((t) => [t.id, t]))

  const albumMap = new Map<string, Album & { tracks: Track[] }>()
  for (const t of tracks) {
    const id = albumIdOf(t)
    let a = albumMap.get(id)
    if (!a) {
      const title = t.album || UNKNOWN_ALBUM
      a = { id, title, artist: albumArtistOf(t), year: t.year, artId: t.artId, trackIds: [], durationSec: 0, sort: sortKey(title), tracks: [] }
      albumMap.set(id, a)
    }
    a.tracks.push(t)
    a.durationSec += t.durationSec || 0
    a.artId ??= t.artId
    if (t.year && (!a.year || t.year > a.year)) a.year = t.year
  }
  const albums: Album[] = [...albumMap.values()]
    .map(({ tracks: ts, ...a }) => ({ ...a, trackIds: ts.sort(compareTracksInAlbum).map((t) => t.id) }))
    .sort((a, b) => compareText(a.sort, b.sort) || compareText(a.artist, b.artist))

  const artistMap = new Map<string, Artist>()
  const ensureArtist = (name: string) => {
    const id = artistIdOf(name)
    let ar = artistMap.get(id)
    if (!ar) {
      ar = { id, name, albumIds: [], trackIds: [], artId: null, sort: sortKey(name) }
      artistMap.set(id, ar)
    }
    return ar
  }
  for (const a of albums) {
    const ar = ensureArtist(a.artist)
    ar.albumIds.push(a.id)
    ar.artId ??= a.artId
  }
  for (const t of sorted) {
    // Songs show under the album artist and, if different, under the track artist too.
    ensureArtist(albumArtistOf(t)).trackIds.push(t.id)
    const own = t.artist || UNKNOWN_ARTIST
    if (artistIdOf(own) !== artistIdOf(albumArtistOf(t)) && own !== VARIOUS_ARTISTS) {
      const ar = artistMap.get(artistIdOf(own))
      if (ar) ar.trackIds.push(t.id)
    }
  }
  for (const ar of artistMap.values()) {
    ar.albumIds.sort((x, y) => (albumMap.get(y)?.year ?? 0) - (albumMap.get(x)?.year ?? 0))
  }
  const artists = [...artistMap.values()].sort((a, b) => compareText(a.sort, b.sort))

  return {
    tracks: sorted,
    byId,
    albums,
    albumById: new Map(albums.map((a) => [a.id, a])),
    artists,
    artistById: new Map(artists.map((a) => [a.id, a])),
    playlists: [...playlists].sort((a, b) => compareText(a.name, b.name)),
  }
}

function commit(tracks: Track[], playlists: Playlist[]) {
  library.set((s) => ({ ...derive(tracks, playlists), version: s.version + 1 }))
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

export async function loadLibrary() {
  try {
    const [tracks, playlists] = await Promise.all([db.getAll<Track>('tracks'), db.getAll<Playlist>('playlists')])
    commit(tracks, playlists)
    library.set({ loaded: true, error: null })
  } catch (e) {
    console.error('[library] load failed', e)
    library.set({ loaded: true, error: e instanceof Error ? e.message : String(e) })
  }
}

/* ------------------------------------------------------------------ */
/* Track mutations                                                     */
/* ------------------------------------------------------------------ */

export function hasContentHash(hash: string) {
  return library.get().tracks.some((t) => t.contentHash === hash)
}

/** Add already-persisted tracks to the in-memory library. */
export function addTracksToMemory(tracks: Track[]) {
  const s = library.get()
  commit([...s.tracks, ...tracks], s.playlists)
}

export async function updateTrack(id: string, patch: Partial<Track>) {
  const s = library.get()
  const t = s.byId.get(id)
  if (!t) return
  const next = { ...t, ...patch }
  await db.put('tracks', next)
  const cur = library.get()
  commit(cur.tracks.map((x) => (x.id === id ? next : x)), cur.playlists)
}

/** Delete tracks + their audio, remove them from playlists, and drop orphaned artwork. */
export async function deleteTracks(ids: string[]) {
  const drop = new Set(ids)
  const s = library.get()
  const remaining = s.tracks.filter((t) => !drop.has(t.id))
  const usedArt = new Set(remaining.map((t) => t.artId).filter(Boolean))
  const orphanArt = [...new Set(s.tracks.filter((t) => drop.has(t.id) && t.artId && !usedArt.has(t.artId)).map((t) => t.artId!))]
  const now = Date.now()
  const changedPlaylists = s.playlists
    .filter((p) => p.trackIds.some((id) => drop.has(id)))
    .map((p) => ({ ...p, trackIds: p.trackIds.filter((id) => !drop.has(id)), updatedAt: now }))

  await db.withStores(['tracks', 'audio', 'artThumbs', 'artFull', 'playlists'], 'readwrite', (tx) => {
    for (const id of ids) {
      tx.objectStore('tracks').delete(id)
      tx.objectStore('audio').delete(id)
    }
    for (const a of orphanArt) {
      tx.objectStore('artThumbs').delete(a)
      tx.objectStore('artFull').delete(a)
    }
    for (const p of changedPlaylists) tx.objectStore('playlists').put(p)
  })

  const byPl = new Map(changedPlaylists.map((p) => [p.id, p]))
  commit(remaining, s.playlists.map((p) => byPl.get(p.id) ?? p))
}

export async function wipeLibrary() {
  await db.clearStores(['tracks', 'audio', 'artThumbs', 'artFull', 'playlists', 'kv'])
  commit([], [])
}

/* ------------------------------------------------------------------ */
/* Playlists                                                           */
/* ------------------------------------------------------------------ */

async function savePlaylist(p: Playlist) {
  await db.put('playlists', p)
  const s = library.get()
  const exists = s.playlists.some((x) => x.id === p.id)
  commit(s.tracks, exists ? s.playlists.map((x) => (x.id === p.id ? p : x)) : [...s.playlists, p])
  return p
}

function getPlaylist(id: string) {
  const p = library.get().playlists.find((x) => x.id === id)
  if (!p) throw new Error('Playlist not found')
  return p
}

export function createPlaylist(name: string, trackIds: string[] = []) {
  const now = Date.now()
  return savePlaylist({ id: uid(), name: name.trim() || 'Untitled Playlist', trackIds, createdAt: now, updatedAt: now })
}

export function renamePlaylist(id: string, name: string) {
  return savePlaylist({ ...getPlaylist(id), name: name.trim() || 'Untitled Playlist', updatedAt: Date.now() })
}

export function addToPlaylist(id: string, trackIds: string[]) {
  const p = getPlaylist(id)
  return savePlaylist({ ...p, trackIds: [...p.trackIds, ...trackIds], updatedAt: Date.now() })
}

export function removeFromPlaylist(id: string, index: number) {
  const p = getPlaylist(id)
  const trackIds = p.trackIds.filter((_, i) => i !== index)
  return savePlaylist({ ...p, trackIds, updatedAt: Date.now() })
}

export function movePlaylistItem(id: string, from: number, to: number) {
  const p = getPlaylist(id)
  if (to < 0 || to >= p.trackIds.length || from === to) return Promise.resolve(p)
  const trackIds = [...p.trackIds]
  const [item] = trackIds.splice(from, 1)
  trackIds.splice(to, 0, item!)
  return savePlaylist({ ...p, trackIds, updatedAt: Date.now() })
}

export async function deletePlaylist(id: string) {
  await db.del('playlists', id)
  const s = library.get()
  commit(s.tracks, s.playlists.filter((p) => p.id !== id))
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export function tracksFor(ids: string[]): Track[] {
  const byId = library.get().byId
  return ids.map((id) => byId.get(id)).filter((t): t is Track => !!t)
}

export function getAudioBlob(trackId: string): Promise<Blob | undefined> {
  return db.get<{ trackId: string; blob: Blob }>('audio', trackId).then((r) => r?.blob)
}
