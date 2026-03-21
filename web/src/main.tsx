import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/fira-sans/400.css'
import '@fontsource/fira-sans/500.css'
import '@fontsource/fira-sans/600.css'
import '@fontsource/fira-sans/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'
import '@carbon/styles/css/styles.css'
import './index.css'
import './styles/mobile.css'
import ErrorBoundary from './ErrorBoundary'
import { initializePlatformTypography, initializeTheme } from './app/theme'

const rootElement = document.getElementById('root')
const FONT_READY_TIMEOUT_MS = 2500
const STYLESHEET_READY_TIMEOUT_MS = 2500
const WINDOW_LOAD_TIMEOUT_MS = 4000
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

function waitForWindowLoad(timeoutMs: number): Promise<void> {
  if (document.readyState === 'complete') return Promise.resolve()

  return new Promise((resolve) => {
    let settled = false
    const onLoad = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      resolve()
    }

    const timeoutId = window.setTimeout(() => {
      if (settled) return
      settled = true
      window.removeEventListener('load', onLoad)
      resolve()
    }, timeoutMs)

    window.addEventListener('load', onLoad, { once: true })
  })
}

function waitForFontsReady(timeoutMs: number): Promise<void> {
  const fontSet = document.fonts
  if (!fontSet?.ready) return Promise.resolve()

  return Promise.race([
    fontSet.ready.then(() => {}),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, timeoutMs)
    }),
  ])
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

  installVitePreloadRecovery()
  removeExternalGoogleFontLinks()

  // Wait for full load + font settlement to avoid forced layout and FOUC.
  await waitForWindowLoad(WINDOW_LOAD_TIMEOUT_MS)
  await waitForStylesheetsReady(STYLESHEET_READY_TIMEOUT_MS)
  await waitForFontsReady(FONT_READY_TIMEOUT_MS)

  const { App } = await import('./app/App')
  await waitForStylesheetsReady(STYLESHEET_READY_TIMEOUT_MS)
  await nextAnimationFrame()

  // Initialize theme after resources settle to avoid forced layout before stylesheets load.
  initializeTheme()
  initializePlatformTypography()
  createRoot(rootElement).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}

void mountApp()
