import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: null,
        manifest: {
          id: '/',
          name: 'CinemaChat — سینەما چات',
          short_name: 'CinemaChat',
          description: 'پلاتفۆرمی کوردی بۆ فیلم، چات و سەیرکردنی هاوبەش',
          lang: 'ckb',
          dir: 'rtl',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          background_color: '#050505',
          theme_color: '#e50914',
          categories: ['entertainment', 'social'],
          icons: [
            { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/pwa/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'فیلمە نوێیەکان', short_name: 'نوێ', url: '/?pwa=latest', icons: [{ src: '/pwa/icon-192.png', sizes: '192x192' }] },
            { name: 'فیلمە ترێندەکان', short_name: 'ترێند', url: '/?pwa=trending', icons: [{ src: '/pwa/icon-192.png', sizes: '192x192' }] },
          ],
        },
        injectManifest: {
          // Cache only the public shell needed to start the site offline.
          // Pre-caching every lazy admin/analytics chunk competed with the
          // YouTube hero request on first mobile visits and delayed playback.
          globPatterns: [
            'index.html',
            'offline.html',
            'manifest.webmanifest',
            'pwa/*.{png,svg}',
            'assets/index-*.{js,css}',
            'assets/HeroVideoPlayer-*.js',
            'assets/workbox-window*.js',
          ],
          globIgnores: ['**/*.mp4', '**/*.webm', '**/*.m3u8', '**/catalog-fallback.json'],
          // The existing application entry bundle is ~4.5 MB. Cache that
          // shell for offline startup, while the explicit ignores still keep
          // videos and the large catalog payload out of precache.
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },
      }),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || ''),
      'process.env.VITE_WHATSAPP_NUMBER': JSON.stringify(env.VITE_WHATSAPP_NUMBER || ''),
      'process.env.VITE_WHATSAPP_GROUP_LINK': JSON.stringify(env.VITE_WHATSAPP_GROUP_LINK || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Content-hashed file names guarantee every deploy emits brand-new
          // URLs. Aggressive webviews (Facebook/Messenger) that pin old HTML
          // can then never shadow freshly deployed code, while cached HTML
          // always references assets that still resolve. Mirrors Vite's
          // defaults — kept explicit so future config drift cannot silently
          // drop hashing from entry/chunk/asset names.
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Re-enabled HMR with port 0 to allow Vite to find an available port
      hmr: { port: 0 },
      // db.json is persisted by the Express server on almost every interaction
      // (progress saves, likes, chat...). Watching it makes Vite full-reload the
      // page on every movie open — which resets scroll + closes the modal. Ignore
      // it so HMR only reacts to actual source changes.
      watch: {
        ignored: ['**/db.json'],
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3002',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
