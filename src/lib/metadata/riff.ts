import { id3v2Size, parseId3v2 } from './id3'
import { ascii, clean, decodeUtf8, parsePair, parseYear, u16be, u16le, u32be, u32le, type BlobReader } from './reader'
import { resolveGenre } from './genres'
import type { ParsedMetadata } from './types'

/** WAV (RIFF, little-endian) and AIFF (FORM, big-endian): duration + INFO / ID3 chunks. */
export async function parseRiff(r: BlobReader, kind: 'wav' | 'aiff'): Promise<ParsedMetadata> {
  const le = kind === 'wav'
  const u32 = le ? u32le : u32be
  const meta: ParsedMetadata = { container: kind, codec: kind === 'wav' ? 'PCM' : 'AIFF' }
  let byteRate = 0
  let dataSize = 0
  let aiffFrames = 0
  let p = 12

  for (let guard = 0; guard < 256 && p + 8 <= r.size; guard++) {
    const h = await r.bytes(p, 8)
    const id = ascii(h, 0, 4)
    const size = u32(h, 4)
    const start = p + 8
    p = start + size + (size & 1)

    if (id === 'fmt ' && le) {
      const b = await r.bytes(start, Math.min(size, 40))
      const fmt = u16le(b, 0)
      meta.sampleRate = u32le(b, 4)
      byteRate = u32le(b, 8)
      if (fmt === 3) meta.codec = 'PCM float'
    } else if (id === 'COMM' && !le) {
      const b = await r.bytes(start, Math.min(size, 26))
      aiffFrames = u32be(b, 2)
      meta.sampleRate = ieee80(b, 8)
    } else if (id === 'data' || id === 'SSND') {
      dataSize = size
    } else if (id === 'LIST') {
      const b = await r.bytes(start, Math.min(size, 1 << 20))
      if (ascii(b, 0, 4) === 'INFO') readInfo(b, meta)
    } else if (id.toLowerCase() === 'id3 ') {
      const b = await r.bytes(start, Math.min(size, 16 << 20))
      if (id3v2Size(b)) {
        const tags = parseId3v2(b)
        for (const [k, v] of Object.entries(tags))
          if (v != null && (meta as unknown as Record<string, unknown>)[k] == null)
            (meta as unknown as Record<string, unknown>)[k] = v
      }
    }
  }

  if (le && byteRate && dataSize) meta.durationSec = dataSize / byteRate
  if (!le && aiffFrames && meta.sampleRate) meta.durationSec = aiffFrames / meta.sampleRate
  if (meta.durationSec) meta.bitrate = Math.round((r.size * 8) / meta.durationSec / 1000)
  return meta
}

function readInfo(b: Uint8Array, meta: ParsedMetadata) {
  let q = 4
  while (q + 8 <= b.length) {
    const id = ascii(b, q, 4)
    const size = u32le(b, q + 4)
    const val = clean(decodeUtf8(b.subarray(q + 8, q + 8 + size)))
    q += 8 + size + (size & 1)
    if (!val) continue
    switch (id) {
      case 'INAM': meta.title ??= val; break
      case 'IART': meta.artist ??= val; break
      case 'IPRD': meta.album ??= val; break
      case 'ICRD': meta.year ??= parseYear(val); break
      case 'IGNR': meta.genre ??= resolveGenre(val); break
      case 'ITRK':
      case 'IPRT': meta.trackNo ??= parsePair(val)[0]; break
    }
  }
}

/** 80-bit IEEE 754 extended float (AIFF sample rate). */
function ieee80(b: Uint8Array, o: number): number {
  const exp = u16be(b, o) & 0x7fff
  const hi = u32be(b, o + 2)
  const lo = u32be(b, o + 6)
  if (!exp && !hi && !lo) return 0
  return (hi * 2 ** 32 + lo) * 2 ** (exp - 16383 - 63)
}
