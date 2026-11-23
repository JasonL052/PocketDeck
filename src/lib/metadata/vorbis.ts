import { resolveGenre } from './genres'
import { clean, parsePair, parseYear } from './reader'
import type { Tags } from './types'

/** Map Vorbis-comment style KEY=value pairs (FLAC) onto our tag model. */
export function applyVorbisComments(comments: Array<[string, string]>, out: Tags) {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const hit = comments.filter(([key]) => key === k).map(([, v]) => v)
      if (hit.length) return clean(hit.join(', '))
    }
    return undefined
  }
  const first = (...keys: string[]) => {
    for (const k of keys) {
      const hit = comments.find(([key]) => key === k)
      if (hit) return clean(hit[1])
    }
    return undefined
  }

  out.title ??= first('TITLE')
  out.artist ??= get('ARTIST')
  out.album ??= first('ALBUM')
  out.albumArtist ??= first('ALBUMARTIST', 'ALBUM ARTIST', 'ALBUM_ARTIST')
  const [tn, tt] = parsePair(first('TRACKNUMBER'))
  out.trackNo ??= tn
  out.trackTotal ??= tt ?? parsePair(first('TRACKTOTAL', 'TOTALTRACKS'))[0]
  out.discNo ??= parsePair(first('DISCNUMBER'))[0]
  out.year ??= parseYear(first('DATE', 'YEAR', 'ORIGINALDATE'))
  out.genre ??= resolveGenre(first('GENRE'))
  const comp = first('COMPILATION')
  if (comp) out.compilation = comp === '1'
}
