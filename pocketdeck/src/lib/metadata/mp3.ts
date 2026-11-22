import { id3v2Size, parseId3v1, parseId3v2 } from './id3'
import { ascii, u32be, type BlobReader } from './reader'
import type { ParsedMetadata } from './types'

const BITRATES: Record<string, number[]> = {
  'V1L1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  'V1L2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  'V1L3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  'V2L1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  'V2L2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  'V2L3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
}

interface FrameHeader {
  version: number // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  layer: number // 1..3
  bitrate: number // kbps
  sampleRate: number
  samplesPerFrame: number
  mono: boolean
  length: number
}

export function parseFrameHeader(b: Uint8Array, o: number): FrameHeader | null {
  if (b[o] !== 0xff || (b[o + 1]! & 0xe0) !== 0xe0) return null
  const version = (b[o + 1]! >> 3) & 3
  const layerBits = (b[o + 1]! >> 1) & 3
  if (version === 1 || layerBits === 0) return null
  const layer = 4 - layerBits
  const brIdx = b[o + 2]! >> 4
  const srIdx = (b[o + 2]! >> 2) & 3
  if (brIdx === 0 || brIdx === 15 || srIdx === 3) return null
  const padding = (b[o + 2]! >> 1) & 1
  const mono = b[o + 3]! >> 6 === 3
  const bitrate = BITRATES[`${version === 3 ? 'V1' : 'V2'}L${layer}`]![brIdx]!
  const sampleRate = SAMPLE_RATES[version]![srIdx]!
  const samplesPerFrame = layer === 1 ? 384 : layer === 2 ? 1152 : version === 3 ? 1152 : 576
  const length =
    layer === 1
      ? Math.floor(((12 * bitrate * 1000) / sampleRate + padding) * 4)
      : Math.floor((samplesPerFrame / 8) * ((bitrate * 1000) / sampleRate)) + padding
  return { version, layer, bitrate, sampleRate, samplesPerFrame, mono, length }
}

/** Find the first real frame (two consecutive valid headers) in `b` from `start`. */
function findFirstFrame(b: Uint8Array, start: number): { offset: number; h: FrameHeader } | null {
  for (let i = start; i + 4 < b.length; i++) {
    const h = parseFrameHeader(b, i)
    if (!h || h.length < 24) continue
    const next = i + h.length
    if (next + 4 > b.length || parseFrameHeader(b, next)) return { offset: i, h }
  }
  return null
}

export async function parseMp3(r: BlobReader): Promise<ParsedMetadata> {
  const head = await r.bytes(0, 10)
  const tagSize = id3v2Size(head)
  let meta: ParsedMetadata = { container: 'mp3', codec: 'MP3' }

  if (tagSize) {
    const tag = await r.bytes(0, tagSize)
    meta = { ...meta, ...parseId3v2(tag) }
  }

  // ID3v1 fallback for anything v2 didn't provide.
  const tail = await r.bytes(Math.max(0, r.size - 128), 128)
  const hasV1 = ascii(tail, 0, 3) === 'TAG'
  if (hasV1) {
    const v1 = parseId3v1(tail)
    for (const [k, v] of Object.entries(v1)) {
      if (v != null && (meta as unknown as Record<string, unknown>)[k] == null)
        (meta as unknown as Record<string, unknown>)[k] = v
    }
  }

  // Duration: Xing/Info or VBRI header if present, otherwise CBR estimate.
  const scan = await r.bytes(tagSize, 64 * 1024)
  const first = findFirstFrame(scan, 0)
  if (first) {
    const { offset, h } = first
    meta.sampleRate = h.sampleRate
    const sideInfo = h.version === 3 ? (h.mono ? 17 : 32) : h.mono ? 9 : 17
    const xing = offset + 4 + sideInfo
    const xingId = ascii(scan, xing, 4)
    let frames: number | undefined
    let bytes: number | undefined
    if (xingId === 'Xing' || xingId === 'Info') {
      const flags = u32be(scan, xing + 4)
      let q = xing + 8
      if (flags & 1) {
        frames = u32be(scan, q)
        q += 4
      }
      if (flags & 2) bytes = u32be(scan, q)
    } else if (ascii(scan, offset + 36, 4) === 'VBRI') {
      bytes = u32be(scan, offset + 36 + 10)
      frames = u32be(scan, offset + 36 + 14)
    }

    if (frames) {
      meta.durationSec = (frames * h.samplesPerFrame) / h.sampleRate
      const audioBytes = bytes ?? r.size - tagSize - offset - (hasV1 ? 128 : 0)
      meta.bitrate = Math.round((audioBytes * 8) / meta.durationSec / 1000)
    } else {
      const audioBytes = r.size - tagSize - offset - (hasV1 ? 128 : 0)
      meta.bitrate = h.bitrate
      meta.durationSec = (audioBytes * 8) / (h.bitrate * 1000)
    }
  }
  return meta
}
