import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from "vite-plugin-svgr"

// MAP2 Audio Platform - Vite Configuration
// https://vite.dev/config/
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 2000,
    outDir: 'dist',
    sourcemap: true,
  },
  plugins: [react(), svgr()],
  server: {
    port: 3000,
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
  }
})
