import { createRoot } from 'react-dom/client'
import './index.css'
import ErrorBoundary from './ErrorBoundary'
import { App } from './app/App'
import { initializeTheme } from './app/theme'

// Initialize theme before rendering to prevent flash of wrong theme
initializeTheme()

const rootElement = document.getElementById('root')

if (rootElement) {
  try {
    createRoot(rootElement).render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    )
  } catch (e: any) {
    // DIAGNOSTIC: Show fatal render errors on-screen (catches import-time and module-level errors)
    rootElement.innerHTML = `<div style="color:red;padding:20px;font-family:monospace;background:#111;min-height:100vh">
      <h1>⚠️ FATAL RENDER ERROR</h1>
      <pre>${e?.stack || e?.message || String(e)}</pre>
    </div>`
  }
}

// DIAGNOSTIC: Catch any unhandled errors and display them on-screen
window.addEventListener('error', (event) => {
  const root = document.getElementById('root')
  if (root && (!root.innerHTML || root.innerHTML.trim() === '')) {
    root.innerHTML = `<div style="color:red;padding:20px;font-family:monospace;background:#111;min-height:100vh">
      <h1>⚠️ UNCAUGHT ERROR</h1>
      <pre>${event.error?.stack || event.message || 'Unknown error'}</pre>
      <p>File: ${event.filename} Line: ${event.lineno}</p>
    </div>`
  }
})

window.addEventListener('unhandledrejection', (event) => {
  const root = document.getElementById('root')
  if (root && (!root.innerHTML || root.innerHTML.trim() === '')) {
    root.innerHTML = `<div style="color:red;padding:20px;font-family:monospace;background:#111;min-height:100vh">
      <h1>⚠️ UNHANDLED PROMISE REJECTION</h1>
      <pre>${event.reason?.stack || event.reason?.message || String(event.reason)}</pre>
    </div>`
  }
})

