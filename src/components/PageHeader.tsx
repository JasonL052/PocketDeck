import type { ReactNode } from 'react'
import { back as goBack } from '../lib/router'
import { Icon } from './Icon'

/**
 * Sticky large-title header. On iPhone it pads under the translucent status bar
 * (safe-area-inset-top) and keeps a frosted background so scrolled content never
 * shows through the clock/battery area.
 */
export function PageHeader({
  title,
  actions,
  back,
  compact = false,
}: {
  title: string
  actions?: ReactNode
  back?: { label: string; path: string }
  compact?: boolean
}) {
  return (
    <header
      className="sticky top-0 z-10 bg-bg/85 pt-safe backdrop-blur-xl backdrop-saturate-150 md:pt-0"
      data-chrome
    >
      {back && (
        <div className="flex h-11 items-center justify-between px-2 md:px-6 md:pt-4">
          <button
            type="button"
            onClick={() => goBack(back.path)}
            className="flex items-center gap-0.5 rounded-lg px-1 py-1 text-[17px] text-accent"
          >
            <Icon name="chevronLeft" size={24} />
            {back.label}
          </button>
          {compact && actions && <div className="flex items-center gap-1">{actions}</div>}
        </div>
      )}
      {!compact && (
        <div className={`flex items-end justify-between gap-3 px-4 pb-2 md:px-8 ${back ? 'pt-0' : 'pt-3 md:pt-8'}`}>
          <h1 className="min-w-0 truncate font-display text-[32px] leading-tight font-bold tracking-tight md:text-3xl">
            {title}
          </h1>
          {actions && <div className="flex shrink-0 items-center gap-1 pb-1">{actions}</div>}
        </div>
      )}
    </header>
  )
}
