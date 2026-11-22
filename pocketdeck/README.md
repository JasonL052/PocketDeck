# PocketDeck

A personal, offline-first music player that installs on iPhone (Home Screen) and Mac (Dock)
from a free GitHub Pages site. You import your own MP3, M4A, FLAC, WAV and AIFF files once;
they're stored on the device and play with no connection, including from the lock screen.

## Features

- **Import** from iCloud Drive / Files (multi-select), whole folders on Mac, or drag-and-drop
  onto the Mac window. Tags, track numbers and embedded artwork are read automatically;
  re-importing skips songs you already have.
- **Library**: Songs (sort by title, artist or recently added), Albums, Artists, Playlists, and
  instant Search. Lists stay smooth with thousands of songs.
- **Playback**: queue with Play Next / Add to Queue, shuffle, repeat (all / one), gapless-ish
  track changes (next song is preloaded), resume where you left off after relaunch.
- **Lock screen & Control Center**: title, artist, artwork, play/pause, previous/next and
  scrubbing via the Media Session API. AirPlay on Safari.
- **Playlists**: create, rename, reorder, remove songs, delete.
- **Mac**: sidebar layout, volume slider, keyboard shortcuts (Space, ←/→ seek, ⌘←/⌘→ skip, ⌘F).
- **Offline**: the whole app is precached by a service worker; updates install only when you tap
  **Reload**, so an update never interrupts a song.
- Light and dark mode, safe-area aware (notch, Dynamic Island, home indicator).

No accounts, no server, no analytics. Runtime dependencies: React only.

## Deploy

1. Create a **public** GitHub repo (free Pages needs public on the free plan).
2. Push this folder to `main`:
   ```bash
   git init && git add -A && git commit -m "PocketDeck"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
3. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. When **Actions → Deploy to GitHub Pages** is green, open `https://<you>.github.io/<repo>/`.

Every push to `main` redeploys. The relative base (`./`) and hash routes (`#/albums`) mean
the repo name doesn't matter.

### Local development (Mac, optional)

```bash
npm install          # creates package-lock.json; commit it for reproducible CI builds
npm run dev          # http://localhost:5173 (service worker off in dev)
npm run build && npm run preview   # production build incl. service worker
```

Test on iPhone against the GitHub Pages URL (service workers need HTTPS). Debug the phone from
the Mac: iPhone **Settings → Apps → Safari → Advanced → Web Inspector**, then Mac Safari
**Develop → [your iPhone]**.

## Install & import

- **iPhone:** open the URL in Safari → Share → **Add to Home Screen** → keep **Open as Web App**
  on. Open PocketDeck from the Home Screen → **Import Music** → pick files in the Files sheet
  (tap **Select** to choose many; Browse → iCloud Drive for your music folder).
- **Mac:** Safari → **File → Add to Dock…** Open it from the Dock, then Import Music, Import a
  Folder, or drag files/folders onto the window.

Each installed app keeps its **own** library: iPhone and Mac don't sync, and a Safari tab has a
separate library from the installed app. Import inside the installed app.

## Device checklist

Run after deploying (iPhone unless noted):

- [ ] Installs and opens full-screen; title clears the notch; tab bar sits above the home indicator.
- [ ] Settings → **Offline support: Active**. Airplane Mode + reopen → app loads, music plays.
- [ ] Import ~20 files from iCloud Drive (mix of formats) → tags, art, durations look right;
      importing the same files again reports “already in your library”.
- [ ] Play an album, lock the phone → it keeps playing and advances to the next song; lock
      screen shows art; previous/next/scrub work there and in Control Center.
- [ ] A phone call or Siri pauses playback and the app shows paused afterwards.
- [ ] Force-quit, reopen → the mini-player shows the last song; Play resumes at the same spot.
- [ ] Playlists: create, add from ⋯, reorder in Edit, rename, delete.
- [ ] FLAC files play (if any show under Settings → “Can’t play on this device”, see below).
- [ ] Mac: sidebar layout, volume, keyboard shortcuts, folder import, drag-and-drop.
- [ ] Push a small change → reopen → “A new version is available” → Reload → Settings › Version
      shows the new commit.

## Good to know (Safari limitations)

- **Storage**: music is copied into the app's storage (IndexedDB), so your library uses space
  on the device in addition to iCloud. Settings shows usage. Safari may decline “persistent
  storage”; installed apps are still exempt from Safari's 7-day cleanup. Keep originals in
  iCloud as your backup; re-importing restores missing songs without duplicates.
- **FLAC** plays on current iOS/macOS but has had OS-version regressions. If a file can't be
  decoded it's flagged in Settings; converting to ALAC/AAC (`.m4a`) always works.
- **Volume** on iPhone is the hardware buttons (Safari doesn't allow apps to set it).
- **Folders on iPhone**: iOS can't pick whole folders; multi-select files instead.
- **Gapless**: the next song is preloaded so gaps are tiny, but not sample-accurate.
- If audio ever refuses to start after reopening the app (an iOS 26 bug), the player recreates
  its audio element automatically; tapping Play once more always recovers.

## Architecture

```
src/
  main.tsx                  boot: load library metadata → restore playback session
  App.tsx                   routes, global sheets/toasts, keyboard shortcuts
  lib/
    db.ts                   IndexedDB (tracks · audio · artThumbs · artFull · playlists · kv),
                            auto-reconnect when iOS drops the connection
    library.ts              in-memory library store; albums/artists derived from tracks
    metadata/               tag + duration parser: ID3v1/v2.2–2.4 (MP3), MP4/iTunes atoms
                            (M4A/ALAC), FLAC Vorbis comments + PICTURE, WAV/AIFF INFO/ID3
    importer.ts             queue → fingerprint (dedupe) → parse → artwork → store
    artwork.ts              resize to 192/640 px JPEG; LRU object-URL cache
    player.ts               audio engine: queue, shuffle/repeat, prefetch, Media Session,
                            iOS unlock + watchdog, session persistence
    router.ts               hash router · ui.ts sheets/toasts · sw.ts update status
  components/               shell, tab bar, sidebar, mini-player, player bar, Now Playing,
                            virtual list, sheets, import UI
  views/                    Songs, Albums, Artists, Playlists, Search, Settings
```

Heavy data (audio blobs, full-size art) is stored separately from metadata and only read when
needed, so startup and scrolling stay fast regardless of library size.
