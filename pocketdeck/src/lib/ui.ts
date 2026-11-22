import { createStore } from './store'

export type TrackMenuContext =
  | { kind: 'library' }
  | { kind: 'album'; albumId: string }
  | { kind: 'playlist'; playlistId: string; index: number }
  | { kind: 'queue'; index: number }

export type Sheet =
  | { kind: 'track'; trackId: string; context: TrackMenuContext }
  | { kind: 'addToPlaylist'; trackIds: string[] }
  | {
      kind: 'prompt'
      title: string
      placeholder?: string
      initial?: string
      confirmLabel: string
      resolve: (v: string | null) => void
    }
  | {
      kind: 'confirm'
      title: string
      message?: string
      confirmLabel: string
      destructive?: boolean
      resolve: (v: boolean) => void
    }

interface UiState {
  sheet: Sheet | null
  nowPlaying: boolean
  nowPlayingView: 'art' | 'queue'
  toast: { id: number; text: string } | null
}

export const ui = createStore<UiState>({ sheet: null, nowPlaying: false, nowPlayingView: 'art', toast: null })

export function openSheet(sheet: Sheet) {
  ui.set({ sheet })
}

export function closeSheet() {
  const s = ui.get().sheet
  if (s?.kind === 'prompt') s.resolve(null)
  if (s?.kind === 'confirm') s.resolve(false)
  ui.set({ sheet: null })
}

export function promptText(opts: { title: string; placeholder?: string; initial?: string; confirmLabel?: string }) {
  return new Promise<string | null>((resolve) =>
    ui.set({
      sheet: {
        kind: 'prompt',
        confirmLabel: 'Save',
        ...opts,
        resolve: (v) => {
          ui.set({ sheet: null })
          resolve(v)
        },
      },
    }),
  )
}

export function confirmAction(opts: { title: string; message?: string; confirmLabel?: string; destructive?: boolean }) {
  return new Promise<boolean>((resolve) =>
    ui.set({
      sheet: {
        kind: 'confirm',
        confirmLabel: 'OK',
        ...opts,
        resolve: (v) => {
          ui.set({ sheet: null })
          resolve(v)
        },
      },
    }),
  )
}

let toastId = 0
let toastTimer: ReturnType<typeof setTimeout> | null = null
export function showToast(text: string, ms = 2400) {
  const id = ++toastId
  ui.set({ toast: { id, text } })
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    if (ui.get().toast?.id === id) ui.set({ toast: null })
  }, ms)
}

export function openNowPlaying(view: 'art' | 'queue' = 'art') {
  ui.set({ nowPlaying: true, nowPlayingView: view })
}
export function closeNowPlaying() {
  ui.set({ nowPlaying: false })
}
