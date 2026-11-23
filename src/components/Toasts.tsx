import { dismissMessage, usePlayer } from '../lib/player'
import { useStore } from '../lib/store'
import { ui } from '../lib/ui'
import { Icon } from './Icon'

/** Short confirmations ("Added to queue") and playback errors, above the mini-player. */
export function Toasts() {
  const toast = useStore(ui, (s) => s.toast)
  const message = usePlayer((s) => s.message)
  if (!toast && !message) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[45] flex flex-col items-center gap-2 px-4 bottom-[calc(var(--spacing-tabbar)_+_var(--spacing-mini)_+_var(--sab)_+_0.75rem)] md:bottom-28">
      {message && (
        <div className="pd-pop-in pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-lg shadow-black/20">
          <Icon name="alert" size={18} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1">{message}</span>
          <button type="button" onClick={dismissMessage} aria-label="Dismiss" className="-m-1 grid size-7 place-items-center text-ink-3">
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {toast && (
        <div key={toast.id} className="pd-pop-in rounded-full bg-ink px-4 py-2 text-sm font-medium text-bg shadow-lg">
          {toast.text}
        </div>
      )}
    </div>
  )
}
