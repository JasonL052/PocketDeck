import { useState } from 'react'
import { Icon } from './Icon'
import { isIOS, isMac, isStandalone } from '../lib/platform'

/**
 * Shown only in a regular browser tab. Matters because an installed Home Screen /
 * Dock web app gets its own storage, separate from the Safari tab: music imported
 * in a tab would not appear in the installed app.
 */
export function InstallHint() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed || isStandalone()) return null

  const how = isIOS()
    ? <>Tap <Icon name="share" size={15} className="inline -mt-1" /> Share, then <b>Add to Home Screen</b> and keep “Open as Web App” on.</>
    : isMac()
      ? <>In Safari, choose <b>File › Add to Dock…</b></>
      : <>Use your browser’s install option.</>

  return (
    <div className="mx-4 mt-3 flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5 md:mx-8">
      <div className="min-w-0 flex-1 text-sm leading-snug">
        <p className="font-semibold">Install PocketDeck first</p>
        <p className="mt-0.5 text-ink-2">
          {how} Your library lives inside the installed app, not this browser tab.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="-m-1 grid size-8 shrink-0 place-items-center rounded-full text-ink-3"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}
