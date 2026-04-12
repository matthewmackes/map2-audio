import { useRef } from 'react'
import './SpinningCubeLauncher.css'

// ─── Public launcher button component ────────────────────────────────────────
interface SpinningCubeLauncherProps {
  isActive: boolean
  buttonRef: React.RefObject<HTMLButtonElement | null>
  onClick: () => void
}

export function SpinningCubeLauncher({
  isActive,
  buttonRef,
  onClick,
}: SpinningCubeLauncherProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null)

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`shell-launcher__cube-btn${isActive ? ' is-active' : ''}`}
      onClick={onClick}
      aria-label={isActive ? 'Close platform menu' : 'Open platform menu'}
      aria-haspopup="menu"
      aria-expanded={isActive}
      aria-controls="shell-launcher-panel"
    >
      <span className="shell-launcher__cube-scene" aria-hidden="true" ref={containerRef}>
        <span className="wire-cube">
          <span className="wire-cube__face wire-cube__face--front" />
          <span className="wire-cube__face wire-cube__face--back" />
          <span className="wire-cube__face wire-cube__face--left" />
          <span className="wire-cube__face wire-cube__face--right" />
          <span className="wire-cube__face wire-cube__face--top" />
          <span className="wire-cube__face wire-cube__face--bottom" />
        </span>
      </span>
    </button>
  )
}
