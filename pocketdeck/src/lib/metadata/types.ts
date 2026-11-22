export type Container = 'mp3' | 'mp4' | 'flac' | 'wav' | 'aiff' | 'unknown'

export interface Picture {
  data: Uint8Array
  mime: string
}

/** Everything we try to read from a file. Every field is optional: real-world tags are messy. */
export interface ParsedMetadata {
  container: Container
  title?: string
  artist?: string
  album?: string
  albumArtist?: string
  trackNo?: number
  trackTotal?: number
  discNo?: number
  year?: number
  genre?: string
  compilation?: boolean
  picture?: Picture
  durationSec?: number
  codec?: string
  sampleRate?: number
  bitrate?: number
}

export type Tags = Omit<ParsedMetadata, 'container'>
