import { createRoot } from 'react-dom/client'
import './index.css'
import ErrorBoundary from './ErrorBoundary'
import { App } from './app/App'
import { initializeTheme } from './app/theme'

// Initialize theme before rendering to prevent flash of wrong theme
initializeTheme()

const rootElement = document.getElementById('root')

if (rootElement) {
  createRoot(rootElement).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}

