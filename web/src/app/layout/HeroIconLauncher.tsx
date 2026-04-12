import { useRef } from 'react'
import './HeroIconLauncher.css'

// ─── Public hero icon launcher button component ──────────────────────────────
interface HeroIconLauncherProps {
  isActive: boolean
  buttonRef: React.RefObject<HTMLButtonElement | null>
  onClick: () => void
}

export function HeroIconLauncher({
  isActive,
  buttonRef,
  onClick,
}: HeroIconLauncherProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`hero-icon-launcher__btn${isActive ? ' is-active' : ''}`}
      onClick={onClick}
      aria-label={isActive ? 'Close platform menu' : 'Open platform menu'}
      aria-haspopup="menu"
      aria-expanded={isActive}
      aria-controls="shell-launcher-panel"
    >
      <div className="hero-icon-launcher__scene" aria-hidden="true" ref={containerRef}>
        <span className="hero-icon-launcher__wire-cube">
          <span className="hero-icon-launcher__face hero-icon-launcher__face--front" />
          <span className="hero-icon-launcher__face hero-icon-launcher__face--back" />
          <span className="hero-icon-launcher__face hero-icon-launcher__face--left" />
          <span className="hero-icon-launcher__face hero-icon-launcher__face--right" />
          <span className="hero-icon-launcher__face hero-icon-launcher__face--top" />
          <span className="hero-icon-launcher__face hero-icon-launcher__face--bottom" />
        </span>
      </div>
    </button>
  )
}
