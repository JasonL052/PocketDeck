import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ACCEPT, dismissImportReport, importFiles, importState } from '../lib/importer'
import { isIOS, isStandalone } from '../lib/platform'
import { useStore } from '../lib/store'
import { plural } from '../lib/text'
import { confirmAction } from '../lib/ui'
import { Icon } from './Icon'

let fileInput: HTMLInputElement | null = null
let folderInput: HTMLInputElement | null = null
let acknowledgedTab = false

/** Folder import: Safari on macOS supports `webkitdirectory`; iOS does not (reliably). */
export function supportsFolderPicker() {
  return !isIOS() && typeof document !== 'undefined' && 'webkitdirectory' in document.createElement('input')
}

/** Must be called from a tap/click handler (file pickers need a user gesture). */
export function pickFiles() {
  fileInput?.click()
}
export function pickFolder() {
  folderInput?.click()
}

async function startImport(files: File[]) {
  if (!files.length) return
  if (!isStandalone() && !acknowledgedTab) {
    const ok = await confirmAction({
      title: 'Import into this browser tab?',
      message:
        'Installed apps keep their own library. Music imported here won’t appear in the Home Screen or Dock app. For your real library, install PocketDeck first and import from there.',
      confirmLabel: 'Import Anyway',
    })
    if (!ok) return
    acknowledgedTab = true
  }
  importFiles(files)
}

/** Hidden inputs, mounted once at the app root. */
export function ImportInputs() {
  const a = useRef<HTMLInputElement>(null)
  const b = useRef<HTMLInputElement>(null)
  useEffect(() => {
    fileInput = a.current
    folderInput = b.current
    b.current?.setAttribute('webkitdirectory', '')
  }, [])
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = '' // allow picking the same files again later
    void startImport(files)
  }
  return (
    <>
      <input ref={a} type="file" multiple accept={ACCEPT} className="hidden" onChange={onChange} data-testid="import-files" />
      <input ref={b} type="file" multiple className="hidden" onChange={onChange} data-testid="import-folder" />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Drag & drop (Mac): files or whole folders                           */
/* ------------------------------------------------------------------ */

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    const all: FileSystemEntry[] = []
    const next = () =>
      reader.readEntries(
        (batch) => {
          if (!batch.length) return resolve(all)
          all.push(...batch)
          next()
        },
        () => resolve(all),
      )
    next()
  })
}

async function filesFromEntry(entry: FileSystemEntry, depth = 0): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => (entry as FileSystemFileEntry).file((f) => resolve([f]), () => resolve([])))
  }
  if (entry.isDirectory && depth < 8) {
    const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader())
    const nested = await Promise.all(children.map((c) => filesFromEntry(c, depth + 1)))
    return nested.flat()
  }
  return []
}

async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items]
    .map((it) => (it.kind === 'file' ? it.webkitGetAsEntry?.() : null))
    .filter((e): e is FileSystemEntry => !!e)
  if (entries.length) return (await Promise.all(entries.map((e) => filesFromEntry(e)))).flat()
  return [...dt.files]
}

export function DropZone() {
  const [over, setOver] = useState(false)
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth++
      setOver(true)
    }
    const overH = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) setOver(false)
    }
    const drop = async (e: DragEvent) => {
      if (!hasFiles(e) || !e.dataTransfer) return
      e.preventDefault()
      depth = 0
      setOver(false)
      void startImport(await filesFromDrop(e.dataTransfer))
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', overH)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', overH)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  if (!over) return null
  return (
    <div className="pd-fade-in pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-bg/80 p-8 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-accent px-16 py-12 text-center">
        <Icon name="plus" size={36} className="text-accent" />
        <p className="font-display text-xl font-semibold">Drop music to import</p>
        <p className="text-sm text-ink-2">Files or whole folders · MP3, M4A, FLAC, WAV, AIFF</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Buttons + progress                                                  */
/* ------------------------------------------------------------------ */

export function ImportButton({ variant = 'primary', label = 'Import Music' }: { variant?: 'primary' | 'pill' | 'icon'; label?: string }) {
  if (variant === 'icon') {
    return (
      <button type="button" onClick={pickFiles} aria-label="Import music" className="grid size-10 place-items-center rounded-full text-accent">
        <Icon name="plus" size={24} />
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={pickFiles}
      className={
        variant === 'pill'
          ? 'flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[15px] font-semibold text-accent-ink'
          : 'flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink'
      }
    >
      <Icon name="plus" size={18} />
      {label}
    </button>
  )
}

export function ImportToast() {
  const s = useStore(importState, (x) => x)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!s.active && s.finishedAt && !s.issues.length) {
      const t = setTimeout(dismissImportReport, 5000)
      return () => clearTimeout(t)
    }
  }, [s.active, s.finishedAt, s.issues.length])

  if (!s.active && !s.finishedAt) return null
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-3 pt-[calc(var(--sat)+0.5rem)]">
      <div className="pd-pop-in pointer-events-auto w-full max-w-md rounded-2xl border border-line bg-surface/95 p-3.5 shadow-xl shadow-black/20 backdrop-blur-xl" role="status" aria-live="polite">
        {s.active ? (
          <>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold">Importing {s.done + 1 > s.total ? s.total : s.done + 1} of {s.total}</span>
              <span className="text-ink-3 tabular-nums">{pct}%</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-ink-3">{s.current ?? 'Preparing files…'}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <Icon name={s.issues.length ? 'alert' : 'check'} size={20} className={s.issues.length ? 'mt-0.5 text-accent' : 'mt-0.5 text-ink-2'} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">
                  {s.added ? `Added ${plural(s.added, 'song')}` : 'No new songs added'}
                </p>
                {(s.skipped > 0 || s.issues.length > 0 || !s.added) && (
                  <p className="text-ink-2">
                    {[s.skipped ? `${s.skipped} already in your library` : null, s.issues.length ? `${s.issues.length} couldn’t be imported` : null]
                      .filter(Boolean)
                      .join(' · ') || 'Nothing to import.'}
                  </p>
                )}
                {s.issues.length > 0 && (
                  <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-[13px] font-medium text-accent">
                    {open ? 'Hide details' : 'Show details'}
                  </button>
                )}
              </div>
              <button type="button" onClick={dismissImportReport} aria-label="Dismiss" className="-m-1 grid size-8 place-items-center rounded-full text-ink-3">
                <Icon name="close" size={16} />
              </button>
            </div>
            {open && (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto border-t border-line pt-2 text-xs">
                {s.issues.map((i, k) => (
                  <li key={k} className="flex justify-between gap-3">
                    <span className="truncate">{i.name}</span>
                    <span className="shrink-0 text-ink-3">{i.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}
