import { createRoot } from 'react-dom/client'
import './index.css'
import ErrorBoundary from './ErrorBoundary'
import { App } from './app/App'

const rootElement = document.getElementById('root')

if (rootElement) {
  createRoot(rootElement).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}

