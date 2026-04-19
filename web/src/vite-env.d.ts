/// <reference types="vite-plugin-svgr/client" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLATFORM_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __MAP2_PLATFORM_VERSION__: string
declare const __MAP2_PLATFORM_BUILD_DATE__: string
declare const __MAP2_PLATFORM_BUILD_TIME__: string
declare const __MAP2_PLATFORM_BUILD_CHANNEL__: string
declare const __MAP2_PLATFORM_BUILD_TIMESTAMP__: string
