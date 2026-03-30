import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@carbon/styles/css/styles.css'
import './index.css'
import './styles/mobile.css'
import ErrorBoundary from './ErrorBoundary'
import { initializePlatformTypography, initializeTheme } from './app/theme'
import { installDevResponsivenessDiagnostics, markShellReady } from './app/performance/devDiagnostics'

const rootElement = document.getElementById('root')
const STYLESHEET_READY_TIMEOUT_MS = 2500
const PRELOAD_RECOVERY_KEY = 'map2:preload-recovery-ts'
const PRELOAD_RECOVERY_WINDOW_MS = 15000

function removeExternalGoogleFontLinks(): void {
  const selectors = [
    'link[href*="fonts.googleapis.com"]',
    'link[href*="fonts.gstatic.com"]',
  ]

  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => {
      node.parentNode?.removeChild(node)
    })
  })
}

function waitForStylesheetsReady(timeoutMs: number): Promise<void> {
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[]
  const pending = links.filter((link) => !link.disabled && !link.sheet)
  if (pending.length === 0) return Promise.resolve()

  const allLoaded = Promise.all(
    pending.map(
      (link) =>
        new Promise<void>((resolve) => {
          const done = () => {
            link.removeEventListener('load', done)
            link.removeEventListener('error', done)
            resolve()
          }
          link.addEventListener('load', done, { once: true })
          link.addEventListener('error', done, { once: true })
        }),
    ),
  ).then(() => {})

  return Promise.race([
    allLoaded,
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, timeoutMs)
    }),
  ])
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

function preloadNonCriticalFonts(): void {
  if (typeof window === 'undefined') {
    return
  }

  const loadFonts = () => {
    void Promise.allSettled([
      import('@fontsource/fira-sans/400.css'),
      import('@fontsource/fira-sans/500.css'),
      import('@fontsource/fira-sans/600.css'),
      import('@fontsource/fira-sans/700.css'),
      import('@fontsource/inter/400.css'),
      import('@fontsource/inter/500.css'),
      import('@fontsource/inter/600.css'),
      import('@fontsource/inter/700.css'),
      import('@fontsource/roboto/400.css'),
      import('@fontsource/roboto/500.css'),
      import('@fontsource/roboto/700.css'),
      import('@fontsource/space-grotesk/400.css'),
      import('@fontsource/space-grotesk/500.css'),
      import('@fontsource/space-grotesk/700.css'),
    ])
  }

  window.setTimeout(loadFonts, 0)
}

function installVitePreloadRecovery(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('vite:preloadError', (event) => {
    // Tell Vite we handled recovery so it doesn't throw into React render path.
    event.preventDefault()

    const now = Date.now()
    const lastAttempt = Number(window.sessionStorage.getItem(PRELOAD_RECOVERY_KEY) ?? '0')

    // Avoid infinite reload loops if preload errors persist.
    if (Number.isFinite(lastAttempt) && now - lastAttempt < PRELOAD_RECOVERY_WINDOW_MS) {
      console.error('[MAP2] Vite preload failed after recent recovery attempt; manual reload required.')
      return
    }

    window.sessionStorage.setItem(PRELOAD_RECOVERY_KEY, String(now))
    const url = new URL(window.location.href)
    url.searchParams.set('_reload', String(now))
    window.location.replace(url.toString())
  })
}

async function mountApp() {
  if (!rootElement) return

  installDevResponsivenessDiagnostics()
  installVitePreloadRecovery()
  removeExternalGoogleFontLinks()

  await waitForStylesheetsReady(STYLESHEET_READY_TIMEOUT_MS)

  const { App } = await import('./app/App')
  await waitForStylesheetsReady(STYLESHEET_READY_TIMEOUT_MS)

  // Initialize theme before render, but do not block first paint on non-critical fonts.
  initializeTheme()
  initializePlatformTypography()
  createRoot(rootElement).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )

  await nextAnimationFrame()
  markShellReady()
  preloadNonCriticalFonts()
}

void mountApp()
