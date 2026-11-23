import { parseFlac } from './flac'
import { id3v2Size } from './id3'
import { parseMp3, parseFrameHeader } from './mp3'
import { parseMp4 } from './mp4'
import { ascii, BlobReader } from './reader'
import { parseRiff } from './riff'
import type { Container, ParsedMetadata } from './types'

export type { ParsedMetadata, Container, Picture } from './types'

/** Identify the container from magic bytes (extension only as a tiebreaker). */
export async function sniffContainer(file: Blob, name = ''): Promise<Container> {
  const r = new BlobReader(file)
  const b = await r.bytes(0, 16)
  if (ascii(b, 0, 4) === 'fLaC') return 'flac'
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE') return 'wav'
  if (ascii(b, 0, 4) === 'FORM' && /^AIF[FC]$/.test(ascii(b, 8, 4))) return 'aiff'
  if (ascii(b, 4, 4) === 'ftyp') return 'mp4'
  if (ascii(b, 0, 3) === 'ID3') {
    // ID3 can prefix FLAC too.
    const after = await r.bytes(id3v2Size(await r.bytes(0, 10)), 4)
    return ascii(after, 0, 4) === 'fLaC' ? 'flac' : 'mp3'
  }
  if (parseFrameHeader(b, 0)) return 'mp3'
  const ext = name.toLowerCase().split('.').pop() ?? ''
  return EXT_CONTAINER[ext] ?? 'unknown'
}

const EXT_CONTAINER: Record<string, Container> = {
  mp3: 'mp3', m4a: 'mp4', m4b: 'mp4', mp4: 'mp4', aac: 'mp4', alac: 'mp4',
  flac: 'flac', wav: 'wav', wave: 'wav', aif: 'aiff', aiff: 'aiff', aifc: 'aiff',
}

export const CONTAINER_MIME: Record<Container, string> = {
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  flac: 'audio/flac',
  wav: 'audio/wav',
  aiff: 'audio/aiff',
  unknown: '',
}

export const SUPPORTED_EXTENSIONS = Object.keys(EXT_CONTAINER)

/** Parse tags, artwork, duration and codec. Never throws; returns what it could read. */
export async function parseMetadata(file: Blob, name = ''): Promise<ParsedMetadata> {
  const container = await sniffContainer(file, name).catch(() => 'unknown' as const)
  const r = new BlobReader(file)
  try {
    switch (container) {
      case 'mp3':
        return await parseMp3(r)
      case 'mp4':
        return await parseMp4(r)
      case 'flac':
        return await parseFlac(r)
      case 'wav':
      case 'aiff':
        return await parseRiff(r, container)
      default:
        return { container }
    }
  } catch (e) {
    console.warn('[metadata] parse failed', name, e)
    return { container }
  }
}
