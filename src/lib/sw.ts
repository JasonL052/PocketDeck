import { useSyncExternalStore } from 'react'

/**
 * Shared service-worker status so Settings can display it and trigger update checks.
 * Written by <UpdatePrompt>, which owns the registration.
 */
export interface SwStatus {
  supported: boolean
  registration: ServiceWorkerRegistration | null
  offlineReady: boolean
  needRefresh: boolean
  lastCheck: number | null
  error: string | null
}

let status: SwStatus = {
  supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  registration: null,
  offlineReady: false,
  needRefresh: false,
  lastCheck: null,
  error: null,
}
const listeners = new Set<() => void>()

export function setSwStatus(patch: Partial<SwStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}

export function useSwStatus() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => status,
    () => status,
  )
}

/** Ask the browser to re-fetch sw.js; if it changed, `needRefresh` flips to true. */
export async function checkForUpdate() {
  const reg = status.registration
  if (!reg || !navigator.onLine) return
  try {
    await reg.update()
    setSwStatus({ lastCheck: Date.now(), error: null })
  } catch (e) {
    setSwStatus({ lastCheck: Date.now(), error: e instanceof Error ? e.message : String(e) })
  }
}
