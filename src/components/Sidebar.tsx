import { Icon } from './Icon'
import { PRIMARY_NAV, SETTINGS_NAV, type NavItem } from '../lib/nav'
import { href, type Route } from '../lib/router'
import { useLibrary } from '../lib/library'
import { StorageMeter } from './StorageMeter'
import { ImportButton, pickFolder, supportsFolderPicker } from './Import'
import { newPlaylistFlow } from '../views/PlaylistViews'

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <a
      href={href(item.path)}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium transition-colors',
        active ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2/60 hover:text-ink',
      ].join(' ')}
    >
      <Icon name={item.icon} size={19} className={active ? 'text-accent' : undefined} />
      {item.label}
    </a>
  )
}

export function Sidebar({ route, tab }: { route: Route; tab: Route['name'] }) {
  const playlists = useLibrary((s) => s.playlists)
  const version = useLibrary((s) => s.version)

  return (
    <aside className="hidden min-h-0 flex-col border-r border-line bg-surface md:flex" data-chrome aria-label="Sidebar">
      <div className="flex items-center gap-2 px-5 pt-6 pb-5">
        <img src="./favicon.svg" alt="" width={26} height={26} className="rounded-md" />
        <span className="font-display text-lg font-semibold tracking-tight">PocketDeck</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <nav className="flex flex-col gap-0.5 px-3" aria-label="Library">
          <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-ink-3 uppercase">Library</p>
          {PRIMARY_NAV.map((item) => (
            <SideLink key={item.route} item={item} active={tab === item.route} />
          ))}
        </nav>

        <div className="mt-6 px-3 pb-3">
          <div className="flex items-center justify-between px-3 pb-1">
            <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Playlists</p>
            <button type="button" onClick={() => void newPlaylistFlow()} aria-label="New playlist" className="grid size-6 place-items-center rounded text-ink-3 hover:text-accent">
              <Icon name="plus" size={16} />
            </button>
          </div>
          {playlists.length === 0 && <p className="px-3 py-2 text-sm text-ink-3">No playlists yet.</p>}
          {playlists.map((p) => {
            const active = route.name === 'playlist' && route.params.id === p.id
            return (
              <a
                key={p.id}
                href={href(`/playlists/${p.id}`)}
                className={`block truncate rounded-lg px-3 py-1.5 text-[14px] ${active ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2/60 hover:text-ink'}`}
              >
                {p.name}
              </a>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-line px-3 pt-3 pb-4">
        <ImportButton />
        {supportsFolderPicker() && (
          <button type="button" onClick={pickFolder} className="-mt-1 flex items-center justify-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-accent">
            <Icon name="folder" size={15} />
            Import a folder
          </button>
        )}
        <StorageMeter key={version} compact />
        <SideLink item={SETTINGS_NAV} active={tab === 'settings'} />
      </div>
    </aside>
  )
}
