/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_AGORA_APP_ID: string
  readonly VITE_TELEGRAM_BOT_TOKEN: string
  readonly VITE_TELEGRAM_CHANNEL_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
