import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { loadLibrary } from './lib/library'
import { initPlayer } from './lib/player'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Load metadata (not audio) from IndexedDB, then restore the last playback session.
void loadLibrary().then(() => initPlayer())
