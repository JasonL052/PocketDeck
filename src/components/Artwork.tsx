import { useArtUrl } from '../lib/artwork'
import { Icon } from './Icon'

/** Square artwork with a quiet placeholder. Loads lazily from IndexedDB via an LRU URL cache. */
export function Artwork({
  artId,
  variant = 'thumb',
  className = '',
  rounded = 'rounded-md',
  iconSize = 20,
  alt = '',
}: {
  artId: string | null | undefined
  variant?: 'thumb' | 'full'
  className?: string
  rounded?: string
  iconSize?: number
  alt?: string
}) {
  const url = useArtUrl(artId, variant)
  return (
    <div className={`relative shrink-0 overflow-hidden bg-surface-2 ${rounded} ${className}`}>
      {url ? (
        <img src={url} alt={alt} draggable={false} decoding="async" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-ink-3">
          <Icon name="songs" size={iconSize} />
        </div>
      )}
    </div>
  )
}
