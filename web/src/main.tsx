import { createRoot } from 'react-dom/client'
import './index.css'
import ErrorBoundary from './ErrorBoundary'
import { initializeTheme } from './app/theme'

// Initialize theme before rendering to prevent flash of wrong theme
initializeTheme()

const rootElement = document.getElementById('root')

async function mountApp() {
  if (!rootElement) return

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
  const onLoad = () => {
    void mountApp()
  }
  window.addEventListener('load', onLoad, { once: true })
}
