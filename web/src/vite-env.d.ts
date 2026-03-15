/// <reference types="vite-plugin-svgr/client" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLATFORM_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __MAP2_PLATFORM_VERSION__: string
