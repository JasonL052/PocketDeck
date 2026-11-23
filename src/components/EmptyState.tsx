import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: IconName
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-16 text-center md:py-24">
      <div className="mb-5 grid size-16 place-items-center rounded-2xl bg-surface-2 text-ink-3">
        <Icon name={icon} size={30} />
      </div>
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      {children && <div className="mt-2 text-[15px] leading-relaxed text-ink-2">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
