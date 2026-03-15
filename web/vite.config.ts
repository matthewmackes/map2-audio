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
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    outDir: 'dist',
    sourcemap: true,
    // Supported production builds publish atomically via
    // scripts/build_web_dist_atomic.py. That helper builds into a staging
    // directory, merges prior hashed assets, and swaps the finished bundle
    // into place, so Vite can safely clear the staging outDir each run.
    emptyOutDir: true,
    // NOTE: manualChunks was removed because splitting React-dependent
    // libraries (recharts, @emotion, @mui, reactflow) into separate
    // chunks from React itself causes circular initialization errors
    // at runtime (e.g. "can't access forwardRef before initialization").
    // Vite's automatic chunking handles dependency ordering correctly.
  },
  plugins: [react(), svgr()],
})
