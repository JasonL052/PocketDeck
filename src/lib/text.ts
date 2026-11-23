/** Lowercase, strip accents and punctuation spacing: used for grouping and search. */
export function normalize(s: string | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Sort key: normalized, leading articles dropped ("The Beatles" sorts under B). */
export function sortKey(s: string | undefined): string {
  return normalize(s).replace(/^(the|a|an) /, '')
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
export const compareText = (a: string, b: string) => collator.compare(a, b)

export function formatTime(sec: number | undefined | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '0:00'
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

export function formatDuration(sec: number): string {
  if (sec > 0 && sec < 60) return `${Math.round(sec)} sec`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

/** Title from a filename when tags are missing: "01 - Artist - Song_Name.mp3" → "Song Name". */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ')
  const parts = base.split(' - ').map((p) => p.trim()).filter(Boolean)
  const last = parts[parts.length - 1] ?? base
  return last.replace(/^\d{1,3}[\s.-]+/, '').trim() || base.trim()
}

export async function sha256Hex(data: BufferSource): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf).subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
