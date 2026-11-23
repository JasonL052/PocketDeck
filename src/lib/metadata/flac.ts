import { id3v2Size, parseId3v2 } from './id3'
import { applyVorbisComments } from './vorbis'
import { ascii, decodeUtf8, sniffImageMime, u24be, u32be, u32le, type BlobReader } from './reader'
import type { ParsedMetadata, Picture } from './types'

export async function parseFlac(r: BlobReader): Promise<ParsedMetadata> {
  const meta: ParsedMetadata = { container: 'flac', codec: 'FLAC' }
  let p = 0

  // Rare: an ID3v2 tag in front of the FLAC stream.
  const head = await r.bytes(0, 10)
  const id3 = id3v2Size(head)
  if (id3) {
    Object.assign(meta, parseId3v2(await r.bytes(0, id3)))
    p = id3
  }

  if (ascii(await r.bytes(p, 4), 0, 4) !== 'fLaC') return meta
  p += 4

  const comments: Array<[string, string]> = []
  let pictures: Array<Picture & { type: number }> = []

  for (let guard = 0; guard < 128 && p + 4 <= r.size; guard++) {
    const h = await r.bytes(p, 4)
    const last = (h[0]! & 0x80) !== 0
    const type = h[0]! & 0x7f
    const len = u24be(h, 1)
    const start = p + 4
    p = start + len

    if (type === 0) {
      // STREAMINFO
      const b = await r.bytes(start, len)
      const sampleRate = (b[10]! << 12) | (b[11]! << 4) | (b[12]! >> 4)
      const totalSamples = (b[13]! & 0x0f) * 2 ** 32 + u32be(b, 14)
      meta.sampleRate = sampleRate
      if (sampleRate && totalSamples) {
        meta.durationSec = totalSamples / sampleRate
        meta.bitrate = Math.round((r.size * 8) / meta.durationSec / 1000)
      }
    } else if (type === 4) {
      // VORBIS_COMMENT (little-endian lengths)
      const b = await r.bytes(start, len)
      let q = 4 + u32le(b, 0)
      const count = u32le(b, q)
      q += 4
      for (let i = 0; i < count && q + 4 <= b.length; i++) {
        const l = u32le(b, q)
        const s = decodeUtf8(b.subarray(q + 4, q + 4 + l))
        q += 4 + l
        const eq = s.indexOf('=')
        if (eq > 0) comments.push([s.slice(0, eq).toUpperCase(), s.slice(eq + 1)])
      }
    } else if (type === 6) {
      // PICTURE (big-endian)
      const b = await r.bytes(start, len)
      const picType = u32be(b, 0)
      let q = 4
      const mimeLen = u32be(b, q)
      const mime = ascii(b, q + 4, mimeLen)
      q += 4 + mimeLen
      q += 4 + u32be(b, q) // description
      q += 16 // width, height, depth, colors
      const dataLen = u32be(b, q)
      const data = b.subarray(q + 4, q + 4 + dataLen)
      if (data.length > 16) pictures.push({ data, mime: sniffImageMime(data, mime), type: picType })
    }
    if (last) break
  }

  applyVorbisComments(comments, meta)
  if (pictures.length && !meta.picture) {
    pictures = pictures.sort((a, b) => Number(b.type === 3) - Number(a.type === 3))
    meta.picture = { data: pictures[0]!.data, mime: pictures[0]!.mime }
  }
  return meta
}
