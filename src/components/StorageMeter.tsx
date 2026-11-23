import { formatBytes, useStorageInfo } from '../lib/diagnostics'

export function StorageMeter({ compact = false }: { compact?: boolean }) {
  const info = useStorageInfo()
  const pct =
    info?.usage != null && info.quota ? Math.min(100, (info.usage / info.quota) * 100) : 0

  return (
    <div className={compact ? 'px-3' : ''}>
      <div className="flex items-baseline justify-between text-xs text-ink-3">
        <span>Storage</span>
        <span className="tabular-nums">
          {formatBytes(info?.usage)} of {formatBytes(info?.quota)}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
    </div>
  )
}
