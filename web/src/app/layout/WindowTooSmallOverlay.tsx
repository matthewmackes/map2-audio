import { useEffect, useState } from 'react'
import './WindowTooSmallOverlay.css'
import { MIN_VIEWPORT_HEIGHT, MIN_VIEWPORT_WIDTH } from './viewportConstants'

/**
 * Banner that mounts when the browser viewport drops below the
 * supported minimum (1366x768). Pinned to the top of the AppShell
 * with a translucent backdrop so the operator notices immediately.
 *
 * The layout below stays at full size; this component only adds the
 * advisory. CSS `min-width`/`min-height` on `html, body, #root`
 * keeps the workspace pixel-perfect — the operator can scroll the
 * window to see the full GUI even when their physical window is
 * smaller than the minimum.
 */
function readViewport(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: MIN_VIEWPORT_WIDTH, height: MIN_VIEWPORT_HEIGHT }
  return { width: window.innerWidth, height: window.innerHeight }
}

export function WindowTooSmallOverlay() {
  const [viewport, setViewport] = useState(readViewport)

  useEffect(() => {
    if (typeof window === 'undefined') return
    let raf = 0
    function onResize() {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        setViewport(readViewport())
      })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [])

  const tooSmall =
    viewport.width < MIN_VIEWPORT_WIDTH || viewport.height < MIN_VIEWPORT_HEIGHT
  if (!tooSmall) return null

  return (
    <div className="window-too-small" role="alert" aria-live="polite">
      <span className="window-too-small__icon" aria-hidden>
        ⚠
      </span>
      <span className="window-too-small__copy">
        <strong>Window below supported minimum.</strong>
        {' '}
        MAP2 is designed for {MIN_VIEWPORT_WIDTH}×{MIN_VIEWPORT_HEIGHT} or larger.
        Current viewport is {viewport.width}×{viewport.height}.
        Resize the window or scroll to view the full operator surface.
      </span>
    </div>
  )
}

export default WindowTooSmallOverlay
