/** Platform + install-mode detection used for Safari-specific behavior. */

declare global {
  interface Navigator {
    /** iOS Safari only: true when launched from a Home Screen web app. */
    standalone?: boolean
  }
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    navigator.standalone === true
  )
}

/** iPhone / iPod / iPad (iPadOS reports as Mac but has touch). */
export function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function isMac(): boolean {
  return /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints <= 1
}

export function platformLabel(): string {
  if (isIOS()) return /iPad|Macintosh/.test(navigator.userAgent) ? 'iPadOS' : 'iOS'
  if (isMac()) return 'macOS'
  return 'Other'
}
