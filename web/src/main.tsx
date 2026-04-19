import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@carbon/styles/css/styles.css'
import './index.css'
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
      import('@fontsource/open-sans/400.css'),
      import('@fontsource/open-sans/500.css'),
      import('@fontsource/open-sans/600.css'),
      import('@fontsource/open-sans/700.css'),
      import('@fontsource/lato/400.css'),
      import('@fontsource/lato/700.css'),
      import('@fontsource/poppins/400.css'),
      import('@fontsource/poppins/500.css'),
      import('@fontsource/poppins/600.css'),
      import('@fontsource/poppins/700.css'),
      import('@fontsource/montserrat/400.css'),
      import('@fontsource/montserrat/500.css'),
      import('@fontsource/montserrat/600.css'),
      import('@fontsource/montserrat/700.css'),
      import('@fontsource/source-sans-3/400.css'),
      import('@fontsource/source-sans-3/600.css'),
      import('@fontsource/source-sans-3/700.css'),
      import('@fontsource/dm-sans/400.css'),
      import('@fontsource/dm-sans/500.css'),
      import('@fontsource/dm-sans/700.css'),
      import('@fontsource/work-sans/400.css'),
      import('@fontsource/work-sans/500.css'),
      import('@fontsource/work-sans/600.css'),
      import('@fontsource/work-sans/700.css'),
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
  const { App } = await import('./app/App')

  // Apply the saved theme immediately so the first paint lands in the right color system.
  initializeTheme()
  createRoot(rootElement).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )

  await nextAnimationFrame()
  markShellReady()

  // Typography settlement is cosmetic; do it after the shell is already visible.
  void waitForStylesheetsReady(STYLESHEET_READY_TIMEOUT_MS).then(() => {
    initializePlatformTypography()
  })
  preloadNonCriticalFonts()
}

void mountApp()
