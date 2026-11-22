import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const APP_NAME = 'PocketDeck'
const THEME_DARK = '#0f1115'

export default defineConfig({
  // Relative base: the same build works at username.github.io/<any-repo>/ and locally.
  // Safe because routing is hash-based, so the document is always ./index.html.
  base: './',

  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_SHA__: JSON.stringify((process.env.GITHUB_SHA ?? 'local').slice(0, 7)),
  },

  build: {
    target: ['safari16.4', 'es2022'],
  },

  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      base: './',
      scope: './',
      // 'prompt' (not 'autoUpdate'): an automatic reload would cut off playing audio.
      registerType: 'prompt',
      // We register manually via virtual:pwa-register/react in UpdatePrompt.tsx.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon-180.png'],
      manifest: {
        id: './',
        name: APP_NAME,
        short_name: APP_NAME,
        description: 'Your own music, offline.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: THEME_DARK,
        theme_color: THEME_DARK,
        categories: ['music', 'entertainment'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the entire app shell so it launches with zero network.
        globPatterns: ['**/*.{html,js,css,svg,png,ico,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // No runtimeCaching: audio + artwork live in IndexedDB and are served as blob: URLs.
      },
      devOptions: { enabled: false },
    }),
  ],
})
