import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
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
