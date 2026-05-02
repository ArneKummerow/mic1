import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Update silently in the background; the next reload picks up the
      // new bundle. Avoids interrupting students mid-session with a prompt.
      registerType: 'autoUpdate',
      // Cache Monaco's web worker, the editor chunk, and any other static
      // assets so the simulator works fully offline once it has been loaded
      // at least once. Bumped from the default 2 MiB cap because Monaco's
      // bundle is ~3 MiB.
      workbox: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,ttf}'],
      },
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'MIC-1 Visualizer',
        short_name: 'MIC-1',
        description: 'Interactive simulator and visualizer for the MIC-1 CPU architecture.',
        theme_color: '#0e1116',
        background_color: '#0e1116',
        display: 'standalone',
        // Relative scope/start_url so the app installs correctly under any
        // base path (GitHub Pages sub-directory, file://, etc.) — matches
        // Vite's `base: './'` behaviour.
        scope: './',
        start_url: './',
        icons: [
          {
            src: 'icon.svg',
            sizes: '192x192 512x512 any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      // Disable PWA in dev to avoid stale-cache surprises during HMR. Build
      // and `vite preview` still produce a working service worker.
      devOptions: { enabled: false },
    }),
  ],
  // Use relative paths in built assets so the app runs from any sub-path
  // (GitHub Pages, file://, etc.) without configuration.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
