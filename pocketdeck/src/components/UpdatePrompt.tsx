import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Icon } from './Icon'
import { checkForUpdate, setSwStatus } from '../lib/sw'

/**
 * Registers the service worker and shows two toasts:
 *  - "Ready to work offline" once the app shell is fully precached (first install).
 *  - "Update available" when a new deploy is waiting. We never auto-reload, because
 *    reloading would stop whatever is playing; the user taps Reload when convenient.
 *
 * Home Screen apps on iOS stay suspended rather than reloaded, so we also check for
 * updates every time the app returns to the foreground.
 */
export function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      setSwStatus({ registration: registration ?? null })
    },
    onRegisterError(error) {
      setSwStatus({ error: error instanceof Error ? error.message : String(error) })
    },
  })

  useEffect(() => setSwStatus({ offlineReady, needRefresh }), [offlineReady, needRefresh])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkForUpdate()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Auto-hide the one-time "offline ready" toast.
  useEffect(() => {
    if (!offlineReady) return
    const t = setTimeout(() => setOfflineReady(false), 4000)
    return () => clearTimeout(t)
  }, [offlineReady, setOfflineReady])

  if (!offlineReady && !needRefresh) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 bottom-[calc(var(--spacing-tabbar)_+_var(--spacing-mini)_+_var(--sab)_+_0.75rem)] md:bottom-28"
    >
      <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-line bg-surface p-3 pl-4 shadow-lg shadow-black/20">
        <Icon
          name={needRefresh ? 'refresh' : 'check'}
          size={20}
          className={needRefresh ? 'text-accent' : 'text-ink-2'}
        />
        <p className="min-w-0 flex-1 text-sm font-medium">
          {needRefresh ? 'A new version is available.' : 'Ready to work offline.'}
        </p>
        {needRefresh ? (
          <>
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              className="rounded-lg px-2.5 py-1.5 text-sm text-ink-2"
            >
              Later
            </button>
            <button
              type="button"
              onClick={() => void updateServiceWorker(true)}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink"
            >
              Reload
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOfflineReady(false)}
            aria-label="Dismiss"
            className="grid size-8 place-items-center rounded-full text-ink-3"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
