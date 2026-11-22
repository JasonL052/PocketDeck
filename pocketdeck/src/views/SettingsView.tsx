import { useMemo, useState, type ReactNode } from 'react'
import { useDocumentTitle } from '../components/Common'
import { Icon } from '../components/Icon'
import { pickFiles, pickFolder, supportsFolderPicker } from '../components/Import'
import { InstallHint } from '../components/InstallHint'
import { PageHeader } from '../components/PageHeader'
import { StorageMeter } from '../components/StorageMeter'
import { clearArtCache } from '../lib/artwork'
import { formatBytes, requestPersistence, useOnline, useStorageInfo } from '../lib/diagnostics'
import { deleteTracks, useLibrary, wipeLibrary } from '../lib/library'
import { isIOS, isStandalone, platformLabel } from '../lib/platform'
import { forgetTracks, player } from '../lib/player'
import { checkForUpdate, useSwStatus } from '../lib/sw'
import { formatDuration, plural } from '../lib/text'
import { confirmAction, showToast } from '../lib/ui'

function Section({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="px-4 pb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase md:px-0">{title}</h2>
      <div className="divide-y divide-line overflow-hidden border-y border-line bg-surface md:rounded-xl md:border">{children}</div>
      {footer && <p className="px-4 pt-2 text-xs leading-relaxed text-ink-3 md:px-1">{footer}</p>}
    </section>
  )
}

function Row({ label, value, tone }: { label: ReactNode; value?: ReactNode; tone?: 'ok' | 'warn' }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 px-4 py-2.5 text-[15px]">
      <span className="min-w-0 text-ink">{label}</span>
      {value != null && (
        <span
          className={[
            'shrink-0 text-right tabular-nums',
            tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'warn' ? 'text-accent' : 'text-ink-2',
          ].join(' ')}
        >
          {value}
        </span>
      )}
    </div>
  )
}

function ActionRow({ label, onClick, destructive, disabled }: { label: string; onClick: () => void; destructive?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-11 w-full items-center px-4 py-2.5 text-left text-[15px] font-medium hover:bg-surface-2 disabled:opacity-40 ${
        destructive ? 'text-red-500' : 'text-accent'
      }`}
    >
      {label}
    </button>
  )
}

const yesNo = (v: boolean | null | undefined) => (v == null ? 'Unknown' : v ? 'Yes' : 'No')

export function SettingsView() {
  useDocumentTitle('Settings')
  const [refresh, setRefresh] = useState(0)
  const version = useLibrary((s) => s.version)
  const storage = useStorageInfo(refresh + version)
  const tracks = useLibrary((s) => s.tracks)
  const albums = useLibrary((s) => s.albums.length)
  const playlists = useLibrary((s) => s.playlists.length)
  const sw = useSwStatus()
  const online = useOnline()
  const standalone = isStandalone()
  const [checking, setChecking] = useState(false)
  const [showUnplayable, setShowUnplayable] = useState(false)

  const stats = useMemo(() => {
    let bytes = 0
    let secs = 0
    const formats = new Map<string, number>()
    for (const t of tracks) {
      bytes += t.fileSize
      secs += t.durationSec || 0
      const f = (t.codec || t.container).toUpperCase()
      formats.set(f, (formats.get(f) ?? 0) + 1)
    }
    return { bytes, secs, formats: [...formats].sort((a, b) => b[1] - a[1]) }
  }, [tracks])
  const unplayable = useMemo(() => tracks.filter((t) => !t.playable), [tracks])

  return (
    <>
      <PageHeader title="Settings" back={{ label: 'Back', path: '/songs' }} />
      <InstallHint />
      <div className="mx-auto max-w-2xl pb-16 md:px-8">
        <Section title="Library">
          <Row label="Songs" value={tracks.length.toLocaleString()} />
          <Row label="Albums" value={albums.toLocaleString()} />
          <Row label="Playlists" value={playlists.toLocaleString()} />
          <Row label="Total time" value={tracks.length ? formatDuration(stats.secs) : '—'} />
          <Row label="Music size" value={formatBytes(stats.bytes)} />
          {stats.formats.length > 0 && <Row label="Formats" value={stats.formats.map(([f, n]) => `${f} ${n}`).join(' · ')} />}
          <ActionRow label="Import Music…" onClick={pickFiles} />
          {supportsFolderPicker() && <ActionRow label="Import a Folder…" onClick={pickFolder} />}
        </Section>

        {unplayable.length > 0 && (
          <Section
            title="Can’t play on this device"
            footer="These files were imported but this browser reports it can’t decode them (or playback failed). Converting them to M4A (AAC/ALAC) or MP3 fixes this."
          >
            <button
              type="button"
              onClick={() => setShowUnplayable((v) => !v)}
              className="flex min-h-11 w-full items-center justify-between px-4 py-2.5 text-[15px]"
            >
              <span className="flex items-center gap-2">
                <Icon name="alert" size={18} className="text-accent" />
                {plural(unplayable.length, 'file')}
              </span>
              <Icon name={showUnplayable ? 'chevronDown' : 'chevronRight'} size={18} className="text-ink-3" />
            </button>
            {showUnplayable &&
              unplayable.map((t) => (
                <Row key={t.id} label={<span className="block truncate">{t.fileName}</span>} value={(t.codec || t.container).toUpperCase()} />
              ))}
            <ActionRow
              label="Remove These Files"
              destructive
              onClick={async () => {
                const ok = await confirmAction({
                  title: `Remove ${plural(unplayable.length, 'unplayable file')}?`,
                  confirmLabel: 'Remove',
                  destructive: true,
                })
                if (!ok) return
                const ids = unplayable.map((t) => t.id)
                forgetTracks(ids)
                await deleteTracks(ids)
                showToast('Removed')
              }}
            />
          </Section>
        )}

        <Section
          title="Storage"
          footer="Safari often answers “No” to persistent storage even for installed apps. Installed Home Screen apps are still exempt from Safari’s 7-day data cleanup. Keep your original files in iCloud Drive as a backup; re-importing skips songs you already have."
        >
          <div className="px-4 py-3">
            <StorageMeter key={refresh + version} />
          </div>
          <Row label="Used by PocketDeck" value={formatBytes(storage?.usage)} />
          <Row label="Available to app" value={formatBytes(storage?.quota)} />
          <Row label="Persistent storage" value={yesNo(storage?.persisted)} tone={storage?.persisted ? 'ok' : 'warn'} />
          <ActionRow
            label="Request Persistent Storage"
            onClick={async () => {
              const r = await requestPersistence()
              setRefresh((n) => n + 1)
              showToast(r ? 'Storage marked persistent' : 'Safari declined (this is common)')
            }}
          />
          <ActionRow
            label="Delete All Music…"
            destructive
            disabled={!tracks.length && !playlists}
            onClick={async () => {
              const ok = await confirmAction({
                title: 'Delete your whole library?',
                message: `This removes ${plural(tracks.length, 'song')} and ${plural(playlists, 'playlist')} from this device. Your original files aren’t affected.`,
                confirmLabel: 'Delete Everything',
                destructive: true,
              })
              if (!ok) return
              forgetTracks(player.get().queue)
              await wipeLibrary()
              clearArtCache()
              setRefresh((n) => n + 1)
              showToast('Library deleted')
            }}
          />
        </Section>

        <Section title="App">
          <Row label="Installed (standalone)" value={yesNo(standalone)} tone={standalone ? 'ok' : 'warn'} />
          <Row label="Platform" value={platformLabel()} />
          <Row label="Network" value={online ? 'Online' : 'Offline'} />
          <Row
            label="Offline support"
            value={!sw.supported ? 'Unsupported' : sw.registration?.active ? 'Active' : sw.registration ? 'Installing…' : 'Not registered'}
            tone={sw.registration?.active ? 'ok' : 'warn'}
          />
          <Row label="Update waiting" value={yesNo(sw.needRefresh)} />
          {sw.error && <Row label="Service worker error" value={sw.error} tone="warn" />}
          <ActionRow
            label={checking ? 'Checking…' : 'Check for Updates'}
            disabled={!online || !sw.registration || checking}
            onClick={async () => {
              setChecking(true)
              await checkForUpdate()
              setChecking(false)
              if (!player.get().message) showToast(sw.needRefresh ? 'Update ready' : 'You’re up to date')
            }}
          />
        </Section>

        {!isIOS() && (
          <Section title="Keyboard Shortcuts">
            <Row label="Play / Pause" value="Space" />
            <Row label="Seek back / forward 10 s" value="← / →" />
            <Row label="Previous / next song" value="⌘← / ⌘→" />
            <Row label="Search" value="⌘F" />
            <Row label="Close sheet / Now Playing" value="Esc" />
          </Section>
        )}

        <Section title="About">
          <Row label="Version" value={`${__APP_VERSION__} (${__BUILD_SHA__})`} />
          <Row label="Built" value={new Date(__BUILD_TIME__).toLocaleString()} />
        </Section>
      </div>
    </>
  )
}
