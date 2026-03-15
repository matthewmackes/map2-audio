import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from "vite-plugin-svgr"
import fs from 'node:fs'
import path from 'path'

const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'))

// ============================================================================
// MAP2 Audio Platform - Vite Configuration
// ============================================================================
// 
// PORT CONFIGURATION (IMPORTANT - DO NOT CONFUSE):
// - Port 3000: PRODUCTION preview server (npm run preview) - serves dist/ with proxy
// - Port 3001: DEVELOPMENT Vite server (npm run dev) - HMR + source maps
//
// Common mistake: Thinking port 3000 is the dev server. It's NOT!
// See web/PORTS.md for full documentation.
// ============================================================================
// https://vite.dev/config/
export default defineConfig({
  define: {
    __MAP2_PLATFORM_VERSION__: JSON.stringify(packageJson.version),
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
    // Keep prior hashed bundles during rebuilds so active clients don't 404
    // when /index.html or in-memory tabs still reference previous asset names.
    // This avoids transient "Loading failed for module index-*.js" outages on
    // the long-running port-3000 preview server while new builds are written.
    emptyOutDir: false,
    // NOTE: manualChunks was removed because splitting React-dependent
    // libraries (recharts, @emotion, @mui, reactflow) into separate
    // chunks from React itself causes circular initialization errors
    // at runtime (e.g. "can't access forwardRef before initialization").
    // Vite's automatic chunking handles dependency ordering correctly.
  },
  plugins: [react(), svgr()],
  server: {
    port: 3001,
    host: '0.0.0.0',
    proxy: {
      // Proxy all API requests to FastAPI backend
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      // Proxy folder endpoints to FastAPI backend
      '/folders': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      // WebSocket proxy for real-time updates
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true,
      },
      // PiPedal-compatible WebSocket endpoint
      '/pipedal': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true,
      },
      // Legacy resources endpoint
      '/resources': {
        target: 'http://localhost:8080',
        changeOrigin: false,
      },
      // Static var files (PiPedal compatibility)
      '/var': {
        target: 'http://localhost:8080',
        changeOrigin: false,
      },
    }
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
    proxy: {
      // Proxy all API requests to FastAPI backend
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      // Proxy folder endpoints to FastAPI backend
      '/folders': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      // WebSocket proxy for real-time updates
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true,
      },
      // PiPedal-compatible WebSocket endpoint
      '/pipedal': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true,
      },
      // Legacy resources endpoint
      '/resources': {
        target: 'http://localhost:8080',
        changeOrigin: false,
      },
      // Static var files (PiPedal compatibility)
      '/var': {
        target: 'http://localhost:8080',
        changeOrigin: false,
      },
    }
  }
})
