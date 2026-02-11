import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from "vite-plugin-svgr"
import path from 'path'

// ============================================================================
// MAP2 Audio Platform - Vite Configuration
// ============================================================================
// 
// PORT CONFIGURATION (IMPORTANT - DO NOT CONFUSE):
// - Port 3000: PRODUCTION static server (npm run serve) - serves dist/ folder
// - Port 3001: DEVELOPMENT Vite server (npm run dev) - HMR + source maps
//
// Common mistake: Thinking port 3000 is the dev server. It's NOT!
// See web/PORTS.md for full documentation.
// ============================================================================
// https://vite.dev/config/
export default defineConfig({
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── Vendor chunks (stable across deploys, cached by browser) ──
          // Function form gives us substring matching so react-dom/client,
          // scheduler, etc. all land in the correct chunk.
          if (id.includes('node_modules')) {
            // Phosphor Icons (large icon library, cache separately)
            if (id.includes('/@phosphor-icons/')) {
              return 'vendor-icons'
            }
            // React core runtime
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router') ||
              id.includes('/scheduler/') ||
              id.includes('/@tanstack/react-query/') ||
              id.includes('/use-sync-external-store/')
            ) {
              return 'vendor-react'
            }
            // MUI + Emotion
            if (
              id.includes('/@mui/') ||
              id.includes('/@emotion/')
            ) {
              return 'vendor-mui'
            }
            // Charts (recharts + d3 ecosystem)
            if (
              id.includes('/recharts/') ||
              id.includes('/d3-') ||
              id.includes('/victory-vendor/')
            ) {
              return 'vendor-charts'
            }
            // ReactFlow graph editor
            if (
              id.includes('/reactflow/') ||
              id.includes('/@reactflow/') ||
              id.includes('/dagre/')
            ) {
              return 'vendor-flow'
            }
            // Framer Motion
            if (id.includes('/framer-motion/')) {
              return 'vendor-animation'
            }
          }
        },
      },
    },
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
