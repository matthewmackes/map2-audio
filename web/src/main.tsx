import { createRoot } from 'react-dom/client'
import './index.css'
import ErrorBoundary from './ErrorBoundary'
import { initializeTheme } from './app/theme'

const rootElement = document.getElementById('root')

async function mountApp() {
  if (!rootElement) return

  // Initialize theme after DOM is ready to avoid forced layout before stylesheets load
  initializeTheme()

  const { App } = await import('./app/App')
  createRoot(rootElement).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}

if (document.readyState === 'complete') {
  void mountApp()
} else {
  window.addEventListener('load', () => void mountApp(), { once: true })
}
