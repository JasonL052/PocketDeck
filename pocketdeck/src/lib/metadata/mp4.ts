import { ID3V1_GENRES } from './genres'
import { ascii, clean, decodeLatin1, decodeUtf8, parseYear, sniffImageMime, u16be, u32be, u64be, type BlobReader } from './reader'
import type { ParsedMetadata } from './types'

interface Atom {
  type: string
  start: number // payload start (absolute within `b`)
  end: number
}

/** Iterate child atoms within b[from, to). */
function* atoms(b: Uint8Array, from: number, to: number): Generator<Atom> {
  let p = from
  while (p + 8 <= to) {
    let size = u32be(b, p)
    const type = decodeLatin1(b.subarray(p + 4, p + 8))
    let header = 8
    if (size === 1) {
      size = u64be(b, p + 8)
      header = 16
    } else if (size === 0) size = to - p
    if (size < header || p + size > to) return
    yield { type, start: p + header, end: p + size }
    p += size
  }
}

function find(b: Uint8Array, from: number, to: number, path: string[]): Atom | undefined {
  let range: Atom | undefined = { type: '', start: from, end: to }
  for (const name of path) {
    let found: Atom | undefined
    for (const a of atoms(b, range.start, range.end)) {
      if (a.type === name) {
        found = a
        break
      }
    }
    if (!found) return undefined
    if (name === 'meta') {
      // `meta` is a full box in MP4 (4 bytes version/flags) but not in some QuickTime files.
      const hasVersion = ascii(b, found.start + 4, 4) !== 'hdlr'
      found = { ...found, start: found.start + (hasVersion ? 4 : 0) }
    }
    range = found
  }
  return range
}

export async function parseMp4(r: BlobReader): Promise<ParsedMetadata> {
  const meta: ParsedMetadata = { container: 'mp4' }

  // Walk top-level atoms with small reads; load only `moov` (metadata + sample tables).
  let p = 0
  let moov: Uint8Array | undefined
  for (let guard = 0; guard < 64 && p + 8 <= r.size; guard++) {
    const h = await r.bytes(p, 16)
    let size = u32be(h, 0)
    const type = ascii(h, 4, 4)
    if (size === 1) size = u64be(h, 8)
    else if (size === 0) size = r.size - p
    if (size < 8) break
    if (type === 'moov') {
      if (size > 64 << 20) break // pathological; bail out
      moov = await r.bytes(p, size)
      break
    }
    p += size
  }
  if (!moov) return meta
  const root = { start: 8, end: moov.length }

  // Duration from mvhd.
  const mvhd = find(moov, root.start, root.end, ['mvhd'])
  if (mvhd) {
    const v = moov[mvhd.start]!
    const timescale = v === 1 ? u32be(moov, mvhd.start + 20) : u32be(moov, mvhd.start + 12)
    const duration = v === 1 ? u64be(moov, mvhd.start + 24) : u32be(moov, mvhd.start + 16)
    if (timescale && duration) {
      meta.durationSec = duration / timescale
      meta.bitrate = Math.round((r.size * 8) / meta.durationSec / 1000)
    }
  }

  // Codec + sample rate from the first audio track's sample description.
  for (const trak of atoms(moov, root.start, root.end)) {
    if (trak.type !== 'trak') continue
    const hdlr = find(moov, trak.start, trak.end, ['mdia', 'hdlr'])
    if (!hdlr || ascii(moov, hdlr.start + 8, 4) !== 'soun') continue
    const stsd = find(moov, trak.start, trak.end, ['mdia', 'minf', 'stbl', 'stsd'])
    if (stsd) {
      const entry = stsd.start + 8
      const fourcc = ascii(moov, entry + 4, 4)
      meta.codec =
        fourcc === 'mp4a' ? 'AAC' : fourcc === 'alac' ? 'ALAC' : fourcc === 'fLaC' ? 'FLAC' : fourcc === 'Opus' ? 'Opus' : fourcc === 'ac-3' ? 'AC-3' : fourcc === 'ec-3' ? 'E-AC-3' : fourcc
      meta.sampleRate = u32be(moov, entry + 32) >>> 16 || undefined
    }
    break
  }

  // iTunes-style tags: moov/udta/meta/ilst
  const ilst = find(moov, root.start, root.end, ['udta', 'meta', 'ilst'])
  if (ilst) {
    for (const item of atoms(moov, ilst.start, ilst.end)) {
      let dataAtom: Atom | undefined
      for (const a of atoms(moov, item.start, item.end)) if (a.type === 'data') dataAtom = a
      if (!dataAtom) continue
      const wellKnown = u32be(moov, dataAtom.start) & 0xffffff
      const value = moov.subarray(dataAtom.start + 8, dataAtom.end)
      const text = () => clean(decodeUtf8(value))

      switch (item.type) {
        case '©nam': meta.title ??= text(); break
        case '©ART': meta.artist ??= text(); break
        case '©alb': meta.album ??= text(); break
        case 'aART': meta.albumArtist ??= text(); break
        case '©day': meta.year ??= parseYear(text()); break
        case '©gen': meta.genre ??= text(); break
        case 'gnre': {
          const idx = value.length >= 2 ? u16be(value, 0) - 1 : -1
          meta.genre ??= ID3V1_GENRES[idx]
          break
        }
        case 'trkn':
          if (value.length >= 6) {
            meta.trackNo = u16be(value, 2) || undefined
            meta.trackTotal = u16be(value, 4) || undefined
          }
          break
        case 'disk':
          if (value.length >= 4) meta.discNo = u16be(value, 2) || undefined
          break
        case 'cpil':
          meta.compilation = value[0] === 1
          break
        case 'covr':
          if (!meta.picture && value.length > 16) {
            const fallback = wellKnown === 14 ? 'image/png' : 'image/jpeg'
            meta.picture = { data: value, mime: sniffImageMime(value, fallback) }
          }
          break
      }
    }
  }
  return meta
}
