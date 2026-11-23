import { Icon } from './Icon'
import { PRIMARY_NAV } from '../lib/nav'
import { href, type RouteName } from '../lib/router'

/** iPhone bottom tab bar. Height = 56px + home-indicator inset. */
export function TabBar({ active }: { active: RouteName }) {
  return (
    <nav
      aria-label="Primary"
      className="border-t border-line bg-surface/90 pb-safe px-safe backdrop-blur-xl backdrop-saturate-150"
    >
      <ul className="grid h-tabbar grid-cols-5">
        {PRIMARY_NAV.map((item) => {
          const isActive = active === item.route
          return (
            <li key={item.route}>
              <a
                href={href(item.path)}
                aria-current={isActive ? 'page' : undefined}
                className={[
                  'flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium',
                  isActive ? 'text-accent' : 'text-ink-3',
                ].join(' ')}
              >
                <Icon name={item.icon} size={23} />
                {item.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
