import { useEffect, useState, useSyncExternalStore } from 'react'

export interface StorageInfo {
  usage: number | null
  quota: number | null
  persisted: boolean | null
}

export async function readStorageInfo(): Promise<StorageInfo> {
  const s = navigator.storage
  const [estimate, persisted] = await Promise.all([
    s?.estimate ? s.estimate().catch(() => null) : null,
    s?.persisted ? s.persisted().catch(() => null) : null,
  ])
  return {
    usage: estimate?.usage ?? null,
    quota: estimate?.quota ?? null,
    persisted,
  }
}

/**
 * Ask for persistent storage. Safari has historically returned `false` here even for
 * installed web apps; we still ask (it costs nothing) and show the result honestly.
 */
export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null
  try {
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

export function useStorageInfo(refreshKey = 0) {
  const [info, setInfo] = useState<StorageInfo | null>(null)
  useEffect(() => {
    let alive = true
    readStorageInfo().then((i) => alive && setInfo(i))
    return () => {
      alive = false
    }
  }, [refreshKey])
  return info
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[u]}`
}
