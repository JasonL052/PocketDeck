/**
 * Random-access reads over a Blob/File. Only the requested byte ranges are loaded,
 * so parsing a 60 MB FLAC touches a few KB (plus embedded artwork).
 */
export class BlobReader {
  readonly size: number
  constructor(private readonly blob: Blob) {
    this.size = blob.size
  }

  async bytes(offset: number, length: number): Promise<Uint8Array> {
    const end = Math.min(this.size, offset + length)
    if (offset >= end) return new Uint8Array(0)
    return new Uint8Array(await this.blob.slice(offset, end).arrayBuffer())
  }
}

export function ascii(b: Uint8Array, start: number, len: number): string {
  let s = ''
  for (let i = start; i < start + len && i < b.length; i++) s += String.fromCharCode(b[i]!)
  return s
}

export function u16be(b: Uint8Array, o: number) {
  return ((b[o]! << 8) | b[o + 1]!) >>> 0
}
export function u32be(b: Uint8Array, o: number) {
  return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0
}
export function u24be(b: Uint8Array, o: number) {
  return ((b[o]! << 16) | (b[o + 1]! << 8) | b[o + 2]!) >>> 0
}
export function u16le(b: Uint8Array, o: number) {
  return (b[o]! | (b[o + 1]! << 8)) >>> 0
}
export function u32le(b: Uint8Array, o: number) {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0
}
export function u64be(b: Uint8Array, o: number) {
  return u32be(b, o) * 2 ** 32 + u32be(b, o + 4)
}

const utf8 = new TextDecoder('utf-8')
const utf16le = new TextDecoder('utf-16le')
const utf16be = new TextDecoder('utf-16be')
const latin1 = new TextDecoder('iso-8859-1')

export function decodeUtf8(b: Uint8Array) {
  return utf8.decode(b)
}
export function decodeLatin1(b: Uint8Array) {
  return latin1.decode(b)
}

/** UTF-16 with optional BOM (defaults to little-endian, which is what most taggers write). */
export function decodeUtf16(b: Uint8Array) {
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return utf16be.decode(b.subarray(2))
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return utf16le.decode(b.subarray(2))
  return utf16le.decode(b)
}
export function decodeUtf16be(b: Uint8Array) {
  return utf16be.decode(b)
}

/** Strip NULs / whitespace; empty → undefined. */
export function clean(s: string | undefined | null): string | undefined {
  if (s == null) return undefined
  // eslint-disable-next-line no-control-regex
  const t = s.replace(/\u0000+$/g, '').replace(/\u0000/g, ' / ').replace(/\s+/g, ' ').trim()
  return t.length ? t : undefined
}

/** "3/12" → [3, 12]; "03" → [3, undefined]. */
export function parsePair(s: string | undefined): [number | undefined, number | undefined] {
  if (!s) return [undefined, undefined]
  const m = /^\s*(\d+)\s*(?:\/\s*(\d+))?/.exec(s)
  if (!m) return [undefined, undefined]
  const a = Number(m[1])
  const b = m[2] ? Number(m[2]) : undefined
  return [a > 0 ? a : undefined, b && b > 0 ? b : undefined]
}

export function parseYear(s: string | undefined): number | undefined {
  const m = s ? /(\d{4})/.exec(s) : null
  if (!m) return undefined
  const y = Number(m[1])
  return y > 1000 && y < 3000 ? y : undefined
}

export function sniffImageMime(data: Uint8Array, fallback = 'image/jpeg'): string {
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'image/png'
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg'
  if (ascii(data, 0, 4) === 'GIF8') return 'image/gif'
  if (ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 4) === 'WEBP') return 'image/webp'
  return fallback
}
