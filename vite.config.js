// vite.config.js

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'generateSW',
      filename: 'sw.js',

      includeAssets: [
        'favicon.svg',
        'robots.txt',
        'apple-touch-icon.png',
        'digitalocean.svg',
      ],

      manifest: {
        name: 'Skylight POS Terminal',
        short_name: 'SkylightPOS',
        description:
          'Multi-tenant Point of Sale and Inventory Management System',

        theme_color: '#1a1b1e',
        background_color: '#1a1b1e',

        display: 'standalone',
        scope: '/',
        start_url: '/',

        icons: [
          {
            src: '/digitalocean.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
          {
            src: '/digitalocean.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },

      workbox: {
        // Allow larger JS bundles to be precached
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,

        globPatterns: [
          '**/*.{js,css,html,ico,png,svg}',
        ],

        runtimeCaching: [
          {
            urlPattern:
              /^https:\/\/.*\.firestore\.googleapis\.com\/.*$/i,

            handler: 'NetworkFirst',

            options: {
              cacheName: 'firebase-firestore-cache',

              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },

              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
});