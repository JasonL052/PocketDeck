import { useEffect, useState } from 'react'
import * as db from './db'

export const THUMB_SIZE = 192
export const FULL_SIZE = 640

/** Center-crop + resize to a square JPEG. Returns null if the image can't be decoded. */
async function resizeSquare(src: ImageBitmap, size: number): Promise<Blob | null> {
  const s = Math.min(src.width, src.height)
  const sx = (src.width - s) / 2
  const sy = (src.height - s) / 2
  const out = Math.min(size, s)
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, sx, sy, s, s, 0, 0, out, out)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.86))
  canvas.width = canvas.height = 0 // release backing store promptly (matters on iOS)
  return blob
}

export async function makeArtwork(data: Uint8Array, mime: string): Promise<{ thumb: Blob; full: Blob } | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([data as BlobPart], { type: mime }))
    try {
      const [thumb, full] = await Promise.all([resizeSquare(bitmap, THUMB_SIZE), resizeSquare(bitmap, FULL_SIZE)])
      return thumb && full ? { thumb, full } : null
    } finally {
      bitmap.close()
    }
  } catch (e) {
    console.warn('[artwork] decode failed', e)
    return null
  }
}

export async function saveArtwork(id: string, art: { thumb: Blob; full: Blob }) {
  await db.withStores(['artThumbs', 'artFull'], 'readwrite', (tx) => {
    tx.objectStore('artThumbs').put({ id, blob: art.thumb })
    tx.objectStore('artFull').put({ id, blob: art.full })
  })
}

/* ------------------------------------------------------------------ */
/* Object-URL cache (LRU) so lists don't re-read IndexedDB on scroll.  */
/* ------------------------------------------------------------------ */

type Variant = 'thumb' | 'full'
const LIMIT: Record<Variant, number> = { thumb: 400, full: 12 }
const caches: Record<Variant, Map<string, string>> = { thumb: new Map(), full: new Map() }
const pending = new Map<string, Promise<string | null>>()

function remember(variant: Variant, id: string, url: string) {
  const c = caches[variant]
  c.set(id, url)
  while (c.size > LIMIT[variant]) {
    const [oldId, oldUrl] = c.entries().next().value as [string, string]
    c.delete(oldId)
    URL.revokeObjectURL(oldUrl)
  }
}

export function peekArtUrl(id: string | null | undefined, variant: Variant): string | null {
  if (!id) return null
  const c = caches[variant]
  const url = c.get(id)
  if (url) {
    c.delete(id) // refresh LRU position
    c.set(id, url)
  }
  return url ?? null
}

export function loadArtUrl(id: string, variant: Variant): Promise<string | null> {
  const hit = peekArtUrl(id, variant)
  if (hit) return Promise.resolve(hit)
  const key = `${variant}:${id}`
  let p = pending.get(key)
  if (!p) {
    p = db
      .get<{ id: string; blob: Blob }>(variant === 'thumb' ? 'artThumbs' : 'artFull', id)
      .then((row) => {
        if (!row) return null
        const url = URL.createObjectURL(row.blob)
        remember(variant, id, url)
        return url
      })
      .catch(() => null)
      .finally(() => pending.delete(key))
    pending.set(key, p)
  }
  return p
}

/** Get a displayable URL for artwork (null while loading or if there is none). */
export function useArtUrl(id: string | null | undefined, variant: Variant = 'thumb'): string | null {
  const [state, setState] = useState<{ id: string | null | undefined; url: string | null }>(() => ({
    id,
    url: peekArtUrl(id, variant),
  }))
  const url = state.id === id ? state.url : peekArtUrl(id, variant)

  useEffect(() => {
    if (!id) return
    if (peekArtUrl(id, variant)) {
      setState({ id, url: peekArtUrl(id, variant) })
      return
    }
    let alive = true
    loadArtUrl(id, variant).then((u) => alive && setState({ id, url: u }))
    return () => {
      alive = false
    }
  }, [id, variant])

  return id ? url : null
}

export function clearArtCache() {
  for (const v of ['thumb', 'full'] as const) {
    caches[v].forEach((u) => URL.revokeObjectURL(u))
    caches[v].clear()
  }
}
