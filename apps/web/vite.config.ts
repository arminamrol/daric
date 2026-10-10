import { palette } from '@daric/design-tokens';
import { fa } from '@daric/i18n';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// The API shares the web app's origin (ADR-0006: its cookies are same-site and host-only), so
// development and preview proxy `/v1` to it; production puts both behind one reverse proxy.
const api = { '/v1': 'http://localhost:3000' };

// The scripts load this file with `--configLoader runner`: workspace packages ship TypeScript
// source, which the default (bundling) loader leaves to Node, and Node cannot import it.
export default defineConfig({
  server: { proxy: api },
  preview: { proxy: api },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: fa['app.name'],
        short_name: fa['app.name'],
        description: fa['app.tagline'],
        lang: 'fa',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: palette.navy[950],
        background_color: palette.navy[950],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell: precache the build (woff2 only; every browser with service workers has it)
        // and answer every navigation with index.html so the shell opens offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/v1\//],
      },
    }),
  ],
});
