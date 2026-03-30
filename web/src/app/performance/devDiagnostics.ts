type RouteRequestCounts = Record<string, number>

declare global {
  interface Window {
    __map2DevRequestCounts__?: RouteRequestCounts
    __map2DevFetchPatched__?: boolean
    __map2DevInputProbeInstalled__?: boolean
  }
}

const DEV_BOOT_START_MARK = 'map2:boot:start'
const DEV_SHELL_READY_MARK = 'map2:shell:ready'
const DEV_SHELL_READY_MEASURE = 'map2:shell:cold-load'
const DEV_FIRST_INPUT_MARK = 'map2:first-actionable-input'
const DEV_ROUTE_START_PREFIX = 'map2:route:start:'
const DEV_ROUTE_READY_PREFIX = 'map2:route:ready:'
const DEV_ROUTE_MEASURE_PREFIX = 'map2:route:render:'

function isDevBrowser() {
  return import.meta.env.DEV && typeof window !== 'undefined' && typeof performance !== 'undefined'
}

function safeMark(markName: string) {
  if (!isDevBrowser()) {
    return
  }

  performance.mark(markName)
}

function safeMeasure(measureName: string, startMark: string, endMark: string) {
  if (!isDevBrowser()) {
    return
  }

  try {
    performance.measure(measureName, startMark, endMark)
    const entries = performance.getEntriesByName(measureName)
    const latest = entries[entries.length - 1]
    if (latest) {
      console.info(`[MAP2 dev] ${measureName}: ${latest.duration.toFixed(1)}ms`)
    }
  } catch {
    // Ignore duplicate/invalid measures in dev diagnostics.
  }
}

function installFirstInputProbe() {
  if (!isDevBrowser() || window.__map2DevInputProbeInstalled__) {
    return
  }

  window.__map2DevInputProbeInstalled__ = true

  const markInput = () => {
    safeMark(DEV_FIRST_INPUT_MARK)
    document.removeEventListener('pointerdown', markInput, true)
    document.removeEventListener('keydown', markInput, true)
    document.removeEventListener('focusin', markInput, true)
  }

  document.addEventListener('pointerdown', markInput, true)
  document.addEventListener('keydown', markInput, true)
  document.addEventListener('focusin', markInput, true)
}

function installFetchTracker() {
  if (!isDevBrowser() || window.__map2DevFetchPatched__) {
    return
  }

  window.__map2DevFetchPatched__ = true
  window.__map2DevRequestCounts__ = window.__map2DevRequestCounts__ ?? {}

  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const pathname = window.location.pathname || '/'
    const counts = window.__map2DevRequestCounts__ ?? {}
    counts[pathname] = (counts[pathname] ?? 0) + 1
    window.__map2DevRequestCounts__ = counts
    return originalFetch(...args)
  }
}

export function installDevResponsivenessDiagnostics() {
  if (!isDevBrowser()) {
    return
  }

  safeMark(DEV_BOOT_START_MARK)
  installFirstInputProbe()
  installFetchTracker()
}

export function markShellReady() {
  if (!isDevBrowser()) {
    return
  }

  safeMark(DEV_SHELL_READY_MARK)
  safeMeasure(DEV_SHELL_READY_MEASURE, DEV_BOOT_START_MARK, DEV_SHELL_READY_MARK)
}

export function markRouteRenderStart(pathname: string) {
  if (!isDevBrowser()) {
    return
  }

  safeMark(`${DEV_ROUTE_START_PREFIX}${pathname}`)
}

export function markRouteRenderReady(pathname: string) {
  if (!isDevBrowser()) {
    return
  }

  const startMark = `${DEV_ROUTE_START_PREFIX}${pathname}`
  const readyMark = `${DEV_ROUTE_READY_PREFIX}${pathname}`
  safeMark(readyMark)
  safeMeasure(`${DEV_ROUTE_MEASURE_PREFIX}${pathname}`, startMark, readyMark)
}

export function reportRouteRequestVolume(pathname: string) {
  if (!isDevBrowser()) {
    return
  }

  const count = window.__map2DevRequestCounts__?.[pathname] ?? 0
  console.info(`[MAP2 dev] route request volume ${pathname}: ${count}`)
}
