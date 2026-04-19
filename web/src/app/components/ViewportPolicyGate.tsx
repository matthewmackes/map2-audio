import type { ReactNode } from 'react'
import { Map2BrandMark } from './branding/map2Branding'
import {
  MIN_SUPPORTED_VIEWPORT_HEIGHT,
  MIN_SUPPORTED_VIEWPORT_WIDTH,
  useViewportPolicy,
} from '../hooks/useViewportPolicy'
import './ViewportPolicyGate.css'

function formatViewport(value: number): string {
  return Math.max(0, Math.round(value)).toString()
}

export function ViewportPolicyGate({ children }: { children: ReactNode }) {
  const { width, height, isSupportedViewport } = useViewportPolicy()

  if (isSupportedViewport) {
    return <>{children}</>
  }

  return (
    <div className="viewport-policy-screen" role="alert" aria-live="polite">
      <div className="viewport-policy-screen__backdrop" aria-hidden="true">
        <Map2BrandMark className="viewport-policy-screen__brand viewport-policy-screen__brand--primary" />
        <Map2BrandMark className="viewport-policy-screen__brand viewport-policy-screen__brand--secondary" />
      </div>
      <div className="viewport-policy-screen__panel">
        <Map2BrandMark className="viewport-policy-screen__panel-mark" />
        <p className="viewport-policy-screen__eyebrow">Unsupported Viewport</p>
        <h1 className="viewport-policy-screen__title">MAP2 requires a minimum display area of 560&times;917.</h1>
        <p className="viewport-policy-screen__copy">
          This platform requires a large-phone portrait or larger display. Smaller mobile screens and heavily reduced browser windows are not supported.
        </p>
        <div className="viewport-policy-screen__metrics" aria-label="Viewport requirement details">
          <div className="viewport-policy-screen__metric">
            <span className="viewport-policy-screen__metric-label">Detected</span>
            <strong>{formatViewport(width)}x{formatViewport(height)}</strong>
          </div>
          <div className="viewport-policy-screen__metric">
            <span className="viewport-policy-screen__metric-label">Required</span>
            <strong>{MIN_SUPPORTED_VIEWPORT_WIDTH}x{MIN_SUPPORTED_VIEWPORT_HEIGHT}</strong>
          </div>
        </div>
        <p className="viewport-policy-screen__hint">
          Resize the browser window or rotate your device to portrait orientation, then reload.
        </p>
      </div>
    </div>
  )
}
