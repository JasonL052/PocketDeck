import { resolveGenre } from './genres'
import {
  ascii,
  clean,
  decodeLatin1,
  decodeUtf16,
  decodeUtf16be,
  decodeUtf8,
  parsePair,
  parseYear,
  sniffImageMime,
  u24be,
  u32be,
} from './reader'
import type { Picture, Tags } from './types'

/** Size of an ID3v2 tag starting at `b[0]` (header + body + optional footer), or 0. */
export function id3v2Size(b: Uint8Array): number {
  if (b.length < 10 || ascii(b, 0, 3) !== 'ID3') return 0
  const flags = b[5]!
  const size = syncsafe(b, 6)
  return 10 + size + (flags & 0x10 ? 10 : 0)
}

function syncsafe(b: Uint8Array, o: number) {
  return ((b[o]! & 0x7f) << 21) | ((b[o + 1]! & 0x7f) << 14) | ((b[o + 2]! & 0x7f) << 7) | (b[o + 3]! & 0x7f)
}

/** Reverse ID3 "unsynchronisation": every 0xFF 0x00 becomes 0xFF. */
function deunsync(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length)
  let j = 0
  for (let i = 0; i < b.length; i++) {
    out[j++] = b[i]!
    if (b[i] === 0xff && b[i + 1] === 0x00) i++
  }
  return out.subarray(0, j)
}

function decodeText(enc: number, b: Uint8Array): string {
  switch (enc) {
    case 1:
      return decodeUtf16(b)
    case 2:
      return decodeUtf16be(b)
    case 3:
      return decodeUtf8(b)
    default:
      return decodeLatin1(b)
  }
}

/** Index just past a NUL terminator for the given text encoding (2-byte aligned for UTF-16). */
function afterTerminator(b: Uint8Array, start: number, enc: number): number {
  if (enc === 1 || enc === 2) {
    for (let i = start; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i + 2
    return b.length
  }
  const i = b.indexOf(0, start)
  return i < 0 ? b.length : i + 1
}

function textFrame(data: Uint8Array): string | undefined {
  if (data.length < 1) return undefined
  return clean(decodeText(data[0]!, data.subarray(1)))
}

function apicFrame(data: Uint8Array, v22: boolean): (Picture & { type: number }) | undefined {
  if (data.length < 4) return undefined
  const enc = data[0]!
  let p = 1
  let mime: string
  if (v22) {
    const fmt = ascii(data, 1, 3).toUpperCase()
    mime = fmt === 'PNG' ? 'image/png' : 'image/jpeg'
    p = 4
  } else {
    const end = afterTerminator(data, 1, 0)
    mime = decodeLatin1(data.subarray(1, end - 1)).toLowerCase()
    p = end
  }
  const type = data[p]!
  p = afterTerminator(data, p + 1, enc) // skip description
  const img = data.subarray(p)
  if (img.length < 16) return undefined
  if (!mime.startsWith('image/')) mime = mime === 'png' ? 'image/png' : 'image/jpeg'
  return { data: img, mime: sniffImageMime(img, mime), type }
}

const MAP: Record<string, keyof Tags | 'track' | 'disc' | 'date'> = {
  TIT2: 'title', TT2: 'title',
  TPE1: 'artist', TP1: 'artist',
  TALB: 'album', TAL: 'album',
  TPE2: 'albumArtist', TP2: 'albumArtist',
  TRCK: 'track', TRK: 'track',
  TPOS: 'disc', TPA: 'disc',
  TYER: 'date', TYE: 'date', TDRC: 'date', TDRL: 'date', TDOR: 'date', TORY: 'date',
  TCON: 'genre', TCO: 'genre',
  TCMP: 'compilation', TCP: 'compilation',
}

/** Parse a complete ID3v2.2/2.3/2.4 tag (`b` starts with "ID3"). */
export function parseId3v2(tag: Uint8Array): Tags {
  const out: Tags = {}
  const major = tag[3]!
  const flags = tag[5]!
  if (major < 2 || major > 4) return out

  let body = tag.subarray(10, id3v2Size(tag))
  if (flags & 0x80 && major < 4) body = deunsync(body)

  let p = 0
  if (flags & 0x40 && major >= 3) {
    p = major === 3 ? 4 + u32be(body, 0) : syncsafe(body, 0)
  }

  const v22 = major === 2
  const headerLen = v22 ? 6 : 10
  const idLen = v22 ? 3 : 4
  const pictures: Array<Picture & { type: number }> = []
  let date: string | undefined

  while (p + headerLen <= body.length) {
    const id = ascii(body, p, idLen)
    if (!/^[A-Z0-9]+$/.test(id)) break // padding or garbage

    let size: number
    if (v22) size = u24be(body, p + 3)
    else if (major === 4) {
      // Some writers (old iTunes) store plain sizes in v2.4; detect non-syncsafe bytes.
      const raw = body.subarray(p + 4, p + 8)
      size = raw.some((x) => x & 0x80) ? u32be(body, p + 4) : syncsafe(body, p + 4)
    } else size = u32be(body, p + 4)

    const fmtFlags = v22 ? 0 : body[p + 9]!
    let data = body.subarray(p + headerLen, p + headerLen + size)
    p += headerLen + size
    if (size <= 0 || data.length < size) {
      if (size <= 0) continue
      break
    }

    // Frame-level flags: skip compressed/encrypted frames, strip extra header bytes.
    if (major === 4) {
      if (fmtFlags & 0x0c) continue
      let skip = 0
      if (fmtFlags & 0x40) skip += 1
      if (fmtFlags & 0x01) skip += 4
      data = data.subarray(skip)
      if (fmtFlags & 0x02) data = deunsync(data)
    } else if (major === 3) {
      if (fmtFlags & 0xc0) continue
      if (fmtFlags & 0x20) data = data.subarray(1)
    }

    if (id === 'APIC' || id === 'PIC') {
      const pic = apicFrame(data, v22)
      if (pic) pictures.push(pic)
      continue
    }

    const key = MAP[id]
    if (!key) continue
    const text = textFrame(data)
    if (!text) continue

    switch (key) {
      case 'track': {
        const [n, t] = parsePair(text)
        out.trackNo ??= n
        out.trackTotal ??= t
        break
      }
      case 'disc':
        out.discNo ??= parsePair(text)[0]
        break
      case 'date':
        date ??= text
        break
      case 'genre':
        out.genre ??= resolveGenre(text.split(' / ')[0])
        break
      case 'compilation':
        out.compilation = text === '1'
        break
      default:
        if (out[key] == null) (out as Record<string, unknown>)[key] = text
    }
  }

  out.year = parseYear(date)
  if (pictures.length) {
    const front = pictures.find((x) => x.type === 3) ?? pictures[0]!
    out.picture = { data: front.data, mime: front.mime }
  }
  return out
}

/** ID3v1 / v1.1 (last 128 bytes of the file). */
export function parseId3v1(b: Uint8Array): Tags {
  if (b.length < 128 || ascii(b, 0, 3) !== 'TAG') return {}
  const field = (o: number, l: number) => clean(decodeLatin1(b.subarray(o, o + l)))
  const track = b[125] === 0 && b[126]! > 0 ? b[126] : undefined
  const genre = b[127]!
  return {
    title: field(3, 30),
    artist: field(33, 30),
    album: field(63, 30),
    year: parseYear(field(93, 4)),
    trackNo: track,
    genre: genre < 255 ? resolveGenre(String(genre)) : undefined,
  }
}
