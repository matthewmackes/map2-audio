import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from "vite-plugin-svgr"
import fs from 'node:fs'
import path from 'path'

const platformVersionJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'version.json'), 'utf8'),
) as Record<string, unknown>

function digitsOnly(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

const platformVersion = digitsOnly(platformVersionJson.version ?? platformVersionJson.fallback_version) || '0000000000000001'
const platformBuildDate = digitsOnly(platformVersionJson.build_date).slice(0, 8) || platformVersion.slice(0, 8) || '00000000'
const platformBuildTime = digitsOnly(platformVersionJson.build_time).slice(0, 6) || platformVersion.slice(8, 14) || '000000'
const platformBuildChannel = digitsOnly(platformVersionJson.build_channel).slice(0, 2) || platformVersion.slice(14, 16) || '01'
const platformBuildTimestamp = String(platformVersionJson.build_timestamp ?? '')

// ============================================================================
// MAP2 Audio Platform - Vite Build Configuration
// ============================================================================
//
// MAP2 builds the frontend bundle here, then serves `web/dist` through the
// dedicated production server in `scripts/serve_web_dist.mjs` on port 3000.
// ============================================================================
// https://vite.dev/config/
export default defineConfig({
  define: {
    __MAP2_PLATFORM_VERSION__: JSON.stringify(platformVersion),
    __MAP2_PLATFORM_BUILD_DATE__: JSON.stringify(platformBuildDate),
    __MAP2_PLATFORM_BUILD_TIME__: JSON.stringify(platformBuildTime),
    __MAP2_PLATFORM_BUILD_CHANNEL__: JSON.stringify(platformBuildChannel),
    __MAP2_PLATFORM_BUILD_TIMESTAMP__: JSON.stringify(platformBuildTimestamp),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/map2': path.resolve(__dirname, './src/map2'),
      // T2459-C2 — vendor packs ship optional override TSX components
      // under device-packs/<vendor>/{shared,}/overrides/*.tsx. This
      // alias keeps the import paths stable across packs.
      '@/device-packs': path.resolve(__dirname, '..', 'device-packs'),
    },
  },
  server: {
    fs: {
      // Allow Vite to serve files from device-packs/ at the repo root
      // (outside the web/ project root). T2459-C2.
      allow: [
        path.resolve(__dirname, '..'),
      ],
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    outDir: 'dist',
    // Hidden source maps: Vite emits .map files but omits the
    // //# sourceMappingURL footer, so browsers don't fetch them. The static
    // server in scripts/serve_web_dist.mjs additionally 404s any *.map URL.
    sourcemap: 'hidden',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Surgical splits — only leaf libs that are not on the React/Emotion
        // graph. Splitting React-dependent libs (recharts, MUI, ReactFlow)
        // off React itself caused forwardRef init errors, so they remain in
        // the auto-graph; these four are independent and worth their own
        // chunks (Monaco ~3MB, xterm ~250KB, etc.).
        manualChunks(id: string) {
          if (id.includes('monaco-editor') || id.includes('@monaco-editor')) return 'monaco'
          if (id.includes('@xterm/')) return 'xterm'
          if (id.includes('reactflow') || id.includes('dagre')) return 'flow'
          if (id.includes('framer-motion')) return 'motion'
          return undefined
        },
      },
    },
  },
  plugins: [react(), svgr()],
})
